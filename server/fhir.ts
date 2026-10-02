import type { Express, Request, Response } from "express";
import { query } from "./db";
import { randomUUID, createHash, randomBytes } from "crypto";

const FHIR_BASE_URL =
  process.env.EPIC_FHIR_BASE_URL ||
  "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4";

const EPIC_AUTH_URL =
  process.env.EPIC_AUTH_URL ||
  "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/authorize";

const EPIC_TOKEN_URL =
  process.env.EPIC_TOKEN_URL ||
  "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token";

const CLIENT_ID = process.env.EPIC_CLIENT_ID || "";

const EPIC_SCOPES = [
  "openid",
  "fhirUser",
  "launch/patient",
  "patient/Patient.read",
  "patient/DiagnosticReport.read",
  "patient/Goal.read",
  "patient/MedicationRequest.read",
  "patient/MedicationStatement.read",
  "patient/Observation.read",
  "patient/Procedure.read",
  "patient/DocumentReference.read",
  "offline_access",
].join(" ");

function generateCodeVerifier(): string {
  return randomBytes(32)
    .toString("base64url")
    .replace(/[^a-zA-Z0-9\-._~]/g, "")
    .slice(0, 128);
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS fhir_connections (
      id TEXT PRIMARY KEY,
      fhir_base_url TEXT NOT NULL,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      token_type TEXT NOT NULL DEFAULT 'bearer',
      expires_at TIMESTAMP,
      patient_id TEXT,
      scope TEXT,
      state TEXT,
      code_verifier TEXT,
      redirect_uri TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE fhir_connections ADD COLUMN IF NOT EXISTS code_verifier TEXT`).catch(() => {});
  await query(`ALTER TABLE fhir_connections ADD COLUMN IF NOT EXISTS redirect_uri TEXT`).catch(() => {});

  await query(`
    CREATE TABLE IF NOT EXISTS medical_records (
      id UUID PRIMARY KEY,
      child_id UUID,
      resource_type TEXT NOT NULL,
      fhir_id TEXT,
      display_name TEXT NOT NULL,
      category TEXT,
      status TEXT,
      record_date TIMESTAMP,
      details JSONB,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await query(`ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS ai_insights TEXT`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_medical_records_child ON medical_records(child_id)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_medical_records_type ON medical_records(resource_type)`).catch(() => {});
}

function extractDisplay(resource: any): { name: string; category: string; status: string; date: string; details: Record<string, any> } {
  const rt = resource.resourceType;
  const details: Record<string, any> = {};
  let name = "";
  let category = "";
  let status = resource.status || "";
  let date = "";

  switch (rt) {
    case "DiagnosticReport": {
      name = resource.code?.text || resource.code?.coding?.[0]?.display || "Diagnostic Report";
      category = "Diagnostic Reports";
      date = resource.effectiveDateTime || resource.issued || "";
      details.conclusion = resource.conclusion || "";
      details.performer = resource.performer?.map((p: any) => p.display || p.reference).join(", ") || "";
      if (resource.result?.length) {
        details.resultCount = resource.result.length;
      }
      break;
    }
    case "Goal": {
      name = resource.description?.text || resource.description?.coding?.[0]?.display || "Health Goal";
      category = "Goals";
      status = resource.lifecycleStatus || resource.status || "";
      date = resource.startDate || resource.statusDate || "";
      details.target = resource.target?.map((t: any) => t.measure?.text || t.detailString || "").filter(Boolean) || [];
      break;
    }
    case "Medication": {
      name = resource.code?.text || resource.code?.coding?.[0]?.display || "Medication";
      category = "Medications";
      break;
    }
    case "MedicationOrder":
    case "MedicationRequest": {
      const med = resource.medicationCodeableConcept || resource.medicationReference;
      name = med?.text || med?.coding?.[0]?.display || med?.display || "Medication";
      category = "Medications";
      date = resource.authoredOn || resource.dateWritten || "";
      status = resource.status || "";
      details.dosage = resource.dosageInstruction?.map((d: any) => d.text || d.patientInstruction || "").filter(Boolean) || [];
      details.prescriber = resource.requester?.display || resource.requester?.agent?.display || "";
      break;
    }
    case "MedicationStatement": {
      const medCode = resource.medicationCodeableConcept || resource.medicationReference;
      name = medCode?.text || medCode?.coding?.[0]?.display || medCode?.display || "Medication";
      category = "Medications";
      date = resource.effectiveDateTime || resource.effectivePeriod?.start || resource.dateAsserted || "";
      status = resource.status || "";
      details.dosage = resource.dosage?.map((d: any) => d.text || "").filter(Boolean) || [];
      break;
    }
    case "Observation": {
      name = resource.code?.text || resource.code?.coding?.[0]?.display || "Lab Result";
      category = "Lab Results";
      date = resource.effectiveDateTime || resource.issued || "";
      if (resource.valueQuantity) {
        details.value = `${resource.valueQuantity.value} ${resource.valueQuantity.unit || ""}`.trim();
      } else if (resource.valueString) {
        details.value = resource.valueString;
      } else if (resource.valueCodeableConcept) {
        details.value = resource.valueCodeableConcept.text || resource.valueCodeableConcept.coding?.[0]?.display || "";
      }
      details.referenceRange = resource.referenceRange?.map((r: any) => {
        const low = r.low ? `${r.low.value} ${r.low.unit || ""}` : "";
        const high = r.high ? `${r.high.value} ${r.high.unit || ""}` : "";
        return low && high ? `${low} - ${high}` : r.text || "";
      }).filter(Boolean) || [];
      details.interpretation = resource.interpretation?.map((i: any) => i.text || i.coding?.[0]?.display || "").filter(Boolean) || [];
      break;
    }
    case "Patient": {
      const given = resource.name?.[0]?.given?.join(" ") || "";
      const family = resource.name?.[0]?.family || "";
      name = `${given} ${family}`.trim() || "Patient";
      category = "Patient Info";
      date = resource.birthDate || "";
      details.gender = resource.gender || "";
      details.birthDate = resource.birthDate || "";
      details.address = resource.address?.[0]?.text || 
        [resource.address?.[0]?.line?.join(", "), resource.address?.[0]?.city, resource.address?.[0]?.state].filter(Boolean).join(", ") || "";
      details.phone = resource.telecom?.find((t: any) => t.system === "phone")?.value || "";
      break;
    }
    case "Procedure": {
      name = resource.code?.text || resource.code?.coding?.[0]?.display || "Procedure";
      category = "Procedures";
      date = resource.performedDateTime || resource.performedPeriod?.start || "";
      status = resource.status || "";
      details.performer = resource.performer?.map((p: any) => p.actor?.display || "").filter(Boolean).join(", ") || "";
      details.location = resource.location?.display || "";
      details.outcome = resource.outcome?.text || resource.outcome?.coding?.[0]?.display || "";
      break;
    }
    default:
      name = resource.resourceType || "Unknown";
      category = "Other";
  }

  return { name, category, status, date, details };
}

async function getActiveConnection() {
  const rows = await query<any>(`
    SELECT * FROM fhir_connections
    WHERE access_token != 'pending'
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY created_at DESC LIMIT 1
  `);
  return rows[0] || null;
}

async function fhirFetch(conn: any, resourcePath: string) {
  const url = `${conn.fhir_base_url}/${resourcePath}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: "application/fhir+json",
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`FHIR ${resourcePath} failed ${resp.status}: ${body}`);
  }
  return resp.json();
}

function buildServerRedirectUri(req: Request): string {
  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) {
    return `https://${devDomain}/api/fhir/callback`;
  }
  const proto = req.header("x-forwarded-proto") || req.protocol || "https";
  const rawHost = req.header("x-forwarded-host") || req.get("host") || "";
  return `${proto}://${rawHost}/api/fhir/callback`;
}

export async function registerFhirRoutes(app: Express) {
  await ensureTable();

  app.get("/api/fhir/status", async (req: Request, res: Response) => {
    try {
      const rows = await query<any>(
        `SELECT id, patient_id, expires_at, created_at, fhir_base_url FROM fhir_connections
         WHERE access_token != 'pending' ORDER BY created_at DESC LIMIT 1`,
      );
      const conn = rows[0];
      if (!conn) return res.json({ connected: false, hasClientId: !!CLIENT_ID });
      const expired = conn.expires_at && new Date(conn.expires_at) < new Date();
      res.json({
        connected: !expired,
        patientId: conn.patient_id,
        expiresAt: conn.expires_at,
        hasClientId: !!CLIENT_ID,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/fhir/auth-url", async (req: Request, res: Response) => {
    try {
      if (!CLIENT_ID) {
        return res.status(400).json({
          error: "EPIC_CLIENT_ID not configured. Register your app at fhir.epic.com and add the Client ID as a secret.",
        });
      }

      await query(`DELETE FROM fhir_connections WHERE access_token = 'pending'`);

      const clientRedirectUri = req.query.redirect_uri as string | undefined;
      const state = randomUUID();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);

      const redirectUri = clientRedirectUri || buildServerRedirectUri(req);

      await query(
        `INSERT INTO fhir_connections (id, fhir_base_url, access_token, state, code_verifier, redirect_uri)
         VALUES ($1, $2, 'pending', $3, $4, $5)`,
        [randomUUID(), FHIR_BASE_URL, state, codeVerifier, redirectUri],
      );

      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: EPIC_SCOPES,
        state,
        aud: FHIR_BASE_URL,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });

      const authUrl = `${EPIC_AUTH_URL}?${params}`;
      console.log("[FHIR] Auth URL generated");
      console.log("[FHIR] redirect_uri:", redirectUri);
      console.log("[FHIR] client_id:", CLIENT_ID);
      console.log("[FHIR] Full auth URL:", authUrl);
      res.json({ url: authUrl, state, redirectUri });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/fhir/callback", async (req: Request, res: Response) => {
    console.log("[FHIR] Callback received:", JSON.stringify(req.query));
    const { code, state, error: oErr, error_description } = req.query as Record<string, string>;

    if (oErr) {
      console.log("[FHIR] Callback error:", oErr, error_description);
      return res.send(callbackHtml("❌ Connection Failed", `${oErr}: ${error_description || ""}`, "red"));
    }
    if (!code || !state) {
      return res.status(400).send("Missing code or state");
    }

    try {
      const pending = await query<any>(
        `SELECT * FROM fhir_connections WHERE state = $1 AND access_token = 'pending'`,
        [state],
      );
      if (!pending.length) {
        return res.status(400).send(callbackHtml("Invalid State", "Authorization state mismatch. Please try connecting again.", "red"));
      }

      const conn = pending[0];
      const redirectUri = conn.redirect_uri || buildServerRedirectUri(req);
      const codeVerifier = conn.code_verifier;

      const tokenBody: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: CLIENT_ID,
      };
      if (codeVerifier) {
        tokenBody.code_verifier = codeVerifier;
      }

      const tokenResp = await fetch(EPIC_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(tokenBody).toString(),
      });

      if (!tokenResp.ok) {
        const body = await tokenResp.text();
        throw new Error(`Token exchange failed ${tokenResp.status}: ${body}`);
      }

      const token = (await tokenResp.json()) as any;
      const expiresAt = token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null;

      await query(
        `UPDATE fhir_connections
         SET access_token=$1, refresh_token=$2, expires_at=$3, patient_id=$4, scope=$5, state=NULL, code_verifier=NULL
         WHERE state=$6`,
        [
          token.access_token,
          token.refresh_token || null,
          expiresAt,
          token.patient || null,
          token.scope || null,
          state,
        ],
      );

      console.log("[FHIR] Token exchanged successfully, patient:", token.patient);
      res.send(callbackHtml("✅ MyChart Connected!", "Your VCU Health records are now linked. You can close this window.", "#1565C0"));
    } catch (e: any) {
      console.error("FHIR callback error:", e);
      res.send(callbackHtml("Connection Error", e.message, "red"));
    }
  });

  app.post("/api/fhir/exchange", async (req: Request, res: Response) => {
    try {
      const { code, state } = req.body;
      if (!code || !state) {
        return res.status(400).json({ error: "Missing code or state" });
      }

      const pending = await query<any>(
        `SELECT * FROM fhir_connections WHERE state = $1 AND access_token = 'pending'`,
        [state],
      );
      if (!pending.length) {
        return res.status(400).json({ error: "Invalid or expired state" });
      }

      const conn = pending[0];
      const redirectUri = conn.redirect_uri;
      const codeVerifier = conn.code_verifier;

      if (!redirectUri) {
        return res.status(400).json({ error: "No redirect_uri associated with this state" });
      }

      const tokenBody: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: CLIENT_ID,
      };
      if (codeVerifier) {
        tokenBody.code_verifier = codeVerifier;
      }

      console.log("[FHIR] Exchanging code for token, redirect_uri:", redirectUri);
      const tokenResp = await fetch(EPIC_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(tokenBody).toString(),
      });

      if (!tokenResp.ok) {
        const body = await tokenResp.text();
        console.error("[FHIR] Token exchange failed:", tokenResp.status, body);
        return res.status(tokenResp.status).json({ error: `Token exchange failed: ${body}` });
      }

      const token = (await tokenResp.json()) as any;
      const expiresAt = token.expires_in
        ? new Date(Date.now() + token.expires_in * 1000).toISOString()
        : null;

      await query(
        `UPDATE fhir_connections
         SET access_token=$1, refresh_token=$2, expires_at=$3, patient_id=$4, scope=$5, state=NULL, code_verifier=NULL
         WHERE state=$6`,
        [
          token.access_token,
          token.refresh_token || null,
          expiresAt,
          token.patient || null,
          token.scope || null,
          state,
        ],
      );

      console.log("[FHIR] Token exchanged successfully via /exchange, patient:", token.patient);
      res.json({
        success: true,
        patientId: token.patient || null,
        expiresIn: token.expires_in || 3600,
        scope: token.scope || null,
      });
    } catch (e: any) {
      console.error("FHIR exchange error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/fhir/patients", async (req: Request, res: Response) => {
    try {
      const conn = await getActiveConnection();
      if (!conn) return res.status(401).json({ error: "Not connected" });
      const patients: any[] = [];
      if (conn.patient_id) {
        try {
          const pt = await fhirFetch(conn, `Patient/${conn.patient_id}`);
          const given = pt.name?.[0]?.given?.join(" ") || "";
          const family = pt.name?.[0]?.family || "";
          patients.push({ id: pt.id, name: `${given} ${family}`.trim(), dob: pt.birthDate });
        } catch {}
      }
      res.json({ patients });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/fhir/sync", async (req: Request, res: Response) => {
    try {
      const conn = await getActiveConnection();
      if (!conn) return res.status(401).json({ error: "Not connected to MyChart" });
      const { childId, patientId } = req.body as { childId: string; patientId?: string };
      if (!childId) return res.status(400).json({ error: "childId required" });
      const pid = patientId || conn.patient_id;
      if (!pid) return res.status(400).json({ error: "No patient ID" });

      const resourceTypes = [
        "DiagnosticReport",
        "Goal",
        "MedicationRequest",
        "MedicationStatement",
        "Observation",
        "Procedure",
        "Patient",
        "DocumentReference",
      ];

      let totalSynced = 0;
      const syncResults: Record<string, number> = {};

      for (const resourceType of resourceTypes) {
        try {
          let entries: any[] = [];

          if (resourceType === "Patient") {
            const pt = await fhirFetch(conn, `Patient/${pid}`);
            entries = [{ resource: pt }];
          } else {
            const searchPath = `${resourceType}?patient=${pid}&_count=100&_sort=-date`;
            const bundle = await fhirFetch(conn, searchPath) as any;
            entries = bundle.entry || [];
          }

          let count = 0;
          for (const entry of entries) {
            const resource = entry.resource;
            if (!resource || resource.status === "entered-in-error") continue;
            const fhirId = resource.id;
            if (!fhirId) continue;

            const existing = await query<any>(
              `SELECT id FROM medical_records WHERE fhir_id = $1 AND child_id = $2 AND resource_type = $3`,
              [fhirId, childId, resource.resourceType],
            );
            if (existing.length) continue;

            const display = extractDisplay(resource);
            const recordDate = display.date ? new Date(display.date) : null;

            await query(
              `INSERT INTO medical_records (id, child_id, resource_type, fhir_id, display_name, category, status, record_date, details)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                randomUUID(),
                childId,
                resource.resourceType,
                fhirId,
                display.name,
                display.category,
                display.status,
                recordDate && !isNaN(recordDate.getTime()) ? recordDate.toISOString() : null,
                JSON.stringify(display.details),
              ],
            );
            count++;
          }

          if (resourceType === "DocumentReference") {
            const docBundle = await fhirFetch(conn, `DocumentReference?patient=${pid}&_count=50&_sort=-date`) as any;
            for (const entry of docBundle.entry || []) {
              const doc = entry.resource;
              if (doc.resourceType !== "DocumentReference") continue;
              if (doc.status === "entered-in-error") continue;
              const content = doc.content?.[0];
              if (!content?.attachment) continue;
              const att = content.attachment;
              const contentType = att.contentType || "application/octet-stream";
              let fileUri = att.url || "";
              const rawTitle = att.title || doc.type?.text || doc.type?.coding?.[0]?.display || "Medical Document";
              const docDate = doc.date || doc.context?.period?.start || new Date().toISOString();
              let fileName = `${rawTitle} — ${docDate.split("T")[0]}`;
              if (att.data) {
                fileUri = `data:${contentType};base64,${att.data}`;
              } else if (att.url) {
                try {
                  const docResp = await fetch(att.url, {
                    headers: { Authorization: `Bearer ${conn.access_token}`, Accept: contentType },
                  });
                  if (docResp.ok) {
                    const buf = Buffer.from(await docResp.arrayBuffer());
                    fileUri = `data:${contentType};base64,${buf.toString("base64")}`;
                  }
                } catch {}
              }
              if (!fileUri) continue;
              if (!fileName.includes(".")) {
                if (contentType.includes("pdf")) fileName += ".pdf";
                else if (contentType.includes("html")) fileName += ".html";
              }
              const fhirDocId = doc.id;
              const marker = `[FHIR:${fhirDocId}]`;
              const existingDoc = await query<any>(
                `SELECT id FROM documents WHERE file_name LIKE $1 AND child_id = $2`,
                [`${marker}%`, childId],
              );
              if (!existingDoc.length) {
                const newId = randomUUID();
                await query(
                  `INSERT INTO documents (id, child_id, uploaded_by, file_uri, file_name, file_type)
                   VALUES ($1, $2, 'MyChart', $3, $4, $5)`,
                  [newId, childId, fileUri, `${marker} ${fileName}`, contentType],
                );
              }
            }
          }

          syncResults[resourceType] = count;
          totalSynced += count;
          console.log(`[FHIR] ${resourceType}: synced ${count} records`);
        } catch (e: any) {
          console.log(`[FHIR] ${resourceType}: skipped (${e.message?.slice(0, 80)})`);
          syncResults[resourceType] = 0;
        }
      }

      console.log(`[FHIR] Total synced: ${totalSynced} records for child ${childId}`);
      res.json({ synced: totalSynced, breakdown: syncResults });
    } catch (e: any) {
      console.error("FHIR sync error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/medical-records", async (req: Request, res: Response) => {
    try {
      const childId = req.query.childId as string | undefined;
      let rows;
      if (childId) {
        rows = await query<any>(
          `SELECT id, child_id as "childId", resource_type as "resourceType", fhir_id as "fhirId",
           display_name as "displayName", category, status, record_date as "recordDate",
           details, ai_insights as "aiInsights", created_at as "createdAt"
           FROM medical_records WHERE child_id = $1 ORDER BY record_date DESC NULLS LAST`,
          [childId],
        );
      } else {
        rows = await query<any>(
          `SELECT id, child_id as "childId", resource_type as "resourceType", fhir_id as "fhirId",
           display_name as "displayName", category, status, record_date as "recordDate",
           details, ai_insights as "aiInsights", created_at as "createdAt"
           FROM medical_records ORDER BY record_date DESC NULLS LAST`,
        );
      }
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.delete("/api/fhir/disconnect", async (_req: Request, res: Response) => {
    try {
      await query(`DELETE FROM fhir_connections`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/fhir/debug", async (req: Request, res: Response) => {
    const redirectUri = buildServerRedirectUri(req);
    res.json({
      clientId: CLIENT_ID ? `${CLIENT_ID.slice(0, 8)}...` : "NOT SET",
      redirectUri,
      fhirBaseUrl: FHIR_BASE_URL,
      authEndpoint: EPIC_AUTH_URL,
      tokenEndpoint: EPIC_TOKEN_URL,
      scopes: EPIC_SCOPES,
    });
  });
}

function callbackHtml(title: string, body: string, color: string) {
  const isSuccess = title.startsWith("✅");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MyChart</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f0f7ff;text-align:center;padding:20px;box-sizing:border-box}
.card{background:#fff;border-radius:20px;padding:40px 32px;max-width:360px;box-shadow:0 4px 24px rgba(0,0,0,.1)}
h2{color:${color};margin:16px 0 8px}p{color:#555;line-height:1.5;margin:0}</style></head>
<body><div class="card"><div style="font-size:56px">${isSuccess ? "✅" : "❌"}</div>
<h2>${title.replace(/^[✅❌]\s*/, "")}</h2><p>${body}</p></div>
<script>
(function(){
  var msg = '${isSuccess ? "fhir-connected" : "fhir-error"}';
  function tryPost(){
    try{ if(window.opener){ window.opener.postMessage(msg,'*'); } }catch(e){}
  }
  tryPost();
  setTimeout(tryPost, 500);
  setTimeout(function(){
    try{ window.close(); }catch(e){}
    document.querySelector('p').textContent += ' You can close this window.';
  }, 2000);
})();
</script></body></html>`;
}
