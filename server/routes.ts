import type { Express, Request, Response } from "express";
import { registerFhirRoutes } from "./fhir";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";
import { query } from "./db";
import { randomUUID } from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink, readdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import sharp from "sharp";

const execAsync = promisify(exec);

const THUMB_WIDTH = 300;
const THUMB_QUALITY = 60;

async function generateThumbnail(base64Uri: string): Promise<string | null> {
  try {
    const raw = base64Uri.startsWith("data:") ? base64Uri.split(",")[1] : base64Uri;
    const buf = Buffer.from(raw, "base64");
    const thumbBuf = await sharp(buf)
      .resize(THUMB_WIDTH, undefined, { withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY })
      .toBuffer();
    return `data:image/jpeg;base64,${thumbBuf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function pdfToImages(base64: string): Promise<string[]> {
  const tmpId = randomUUID();
  const pdfPath = join(tmpdir(), `${tmpId}.pdf`);
  const outPrefix = join(tmpdir(), tmpId);
  try {
    const raw = base64.startsWith("data:") ? base64.split(",")[1] : base64;
    await writeFile(pdfPath, Buffer.from(raw, "base64"));
    // Render up to 5 pages at 150 DPI as PNG
    await execAsync(`pdftoppm -r 150 -png -l 5 "${pdfPath}" "${outPrefix}"`);
    const dir = tmpdir();
    const files = (await readdir(dir))
      .filter((f) => f.startsWith(tmpId) && f.endsWith(".png"))
      .sort()
      .map((f) => join(dir, f));
    const images: string[] = [];
    for (const f of files) {
      const buf = await readFile(f);
      images.push(`data:image/png;base64,${buf.toString("base64")}`);
      await unlink(f).catch(() => {});
    }
    return images;
  } finally {
    await unlink(pdfPath).catch(() => {});
  }
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const SECTION_WEIGHTS: Record<string, { smiley: number; sad: number; possible: number }> = {
  'Sibling Interactions': { smiley: 2, sad: -2, possible: 2 },
  'Daycare Report': { smiley: 3, sad: -3, possible: 3 },
};
function getSectionWeights(section?: string) {
  return SECTION_WEIGHTS[section || ''] || { smiley: 1, sad: 0, possible: 1 };
}

const ROUTINE_ITEMS = [
  { section: 'Morning Routine (7–9 a.m.)', name: 'Make Bed' },
  { section: 'Morning Routine (7–9 a.m.)', name: 'Brush Teeth' },
  { section: 'Morning Routine (7–9 a.m.)', name: 'Get Dressed' },
  { section: 'Morning Routine (7–9 a.m.)', name: 'Use Bathroom' },
  { section: 'Morning Routine (7–9 a.m.)', name: 'Eat Breakfast' },
  { section: 'Morning Routine (7–9 a.m.)', name: 'Say Good Morning / Greet Family' },
  { section: 'Daycare Report', name: 'Overall Behavior at Daycare' },
  { section: 'Daycare Report', name: 'Listened to Teachers' },
  { section: 'Daycare Report', name: 'Played Well with Others' },
  { section: 'Daycare Report', name: 'No Incidents / No Notes' },
  { section: 'Sibling Interactions', name: 'Played Nicely Together' },
  { section: 'Sibling Interactions', name: 'Shared Without Fighting' },
  { section: 'Sibling Interactions', name: 'No Hitting / No Biting' },
  { section: 'Sibling Interactions', name: 'Said Sorry When Needed' },
  { section: 'Sibling Interactions', name: 'Included Each Other in Play' },
  { section: 'Afternoon Routine (3–6 p.m.)', name: 'Snack Time' },
  { section: 'Afternoon Routine (3–6 p.m.)', name: 'Wash Hands Before Snack' },
  { section: 'Afternoon Routine (3–6 p.m.)', name: 'Quiet Play / TV Time' },
  { section: 'Afternoon Routine (3–6 p.m.)', name: 'Homework / Activity Time' },
  { section: 'Afternoon Routine (3–6 p.m.)', name: 'Share Toys / Play Nicely' },
  { section: 'Afternoon Routine (3–6 p.m.)', name: 'Clean Up Toys' },
  { section: 'Evening Routine (6–8 p.m.)', name: 'Eat Vegetables / Finish Plate' },
  { section: 'Evening Routine (6–8 p.m.)', name: 'Bath or Shower' },
  { section: 'Evening Routine (6–8 p.m.)', name: 'Pajamas On' },
  { section: 'Evening Routine (6–8 p.m.)', name: 'Brush Teeth (Evening)' },
  { section: 'Evening Routine (6–8 p.m.)', name: 'Lights Out / Bedtime' },
];

const sseClients = new Set<Response>();

function broadcastUpdate(type: string, data?: any) {
  const message = `data: ${JSON.stringify({ type, data, ts: Date.now() })}\n\n`;
  sseClients.forEach((client) => {
    try { client.write(message); } catch {}
  });
}

export async function registerRoutes(app: Express): Promise<Server> {

  await query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_insights TEXT`).catch(() => {});
  await query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS thumbnail TEXT`).catch(() => {});

  // Appointments table
  await query(`CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY,
    child_id UUID,
    title TEXT NOT NULL,
    provider TEXT,
    location TEXT,
    appointment_date TIMESTAMP NOT NULL,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`).catch(() => {});

  app.get("/api/appointments", async (_req: Request, res: Response) => {
    try {
      const rows = await query(
        `SELECT id, child_id as "childId", title, provider, location,
         appointment_date as "appointmentDate", notes, created_by as "createdBy", created_at as "createdAt"
         FROM appointments ORDER BY appointment_date`,
      );
      res.json(rows);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/appointments", async (req: Request, res: Response) => {
    try {
      const { childId, title, provider, location, appointmentDate, notes, createdBy } = req.body;
      const id = randomUUID();
      const rows = await query(
        `INSERT INTO appointments (id, child_id, title, provider, location, appointment_date, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, child_id as "childId", title, provider, location,
         appointment_date as "appointmentDate", notes, created_by as "createdBy", created_at as "createdAt"`,
        [id, childId || null, title, provider || null, location || null, appointmentDate, notes || null, createdBy || null],
      );
      broadcastUpdate("appointments_changed");
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.delete("/api/appointments/:id", async (req: Request, res: Response) => {
    try {
      await query(`DELETE FROM appointments WHERE id = $1`, [req.params.id]);
      broadcastUpdate("appointments_changed");
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/events", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.write(`: connected\n\n`);

    const heartbeat = setInterval(() => {
      try { res.write(`: ping\n\n`); } catch {}
    }, 25000);

    sseClients.add(res);
    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  app.get("/api/children", async (req: Request, res: Response) => {
    try {
      const rows = await query(
        "SELECT id, first_name as \"firstName\", last_name as \"lastName\", date_of_birth as \"dateOfBirth\", photo, created_at as \"createdAt\" FROM children ORDER BY created_at",
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch children" });
    }
  });

  app.post("/api/children", async (req: Request, res: Response) => {
    try {
      const { id, firstName, lastName, dateOfBirth, photo, createdAt } = req.body;
      const childId = id || randomUUID();
      const rows = await query(
        `INSERT INTO children (id, first_name, last_name, date_of_birth, photo, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING
         RETURNING id, first_name as "firstName", last_name as "lastName", date_of_birth as "dateOfBirth", photo, created_at as "createdAt"`,
        [childId, firstName, lastName, dateOfBirth, photo || null, createdAt || new Date().toISOString()],
      );
      const child = rows[0] || { id: childId, firstName, lastName, dateOfBirth, photo, createdAt };
      broadcastUpdate("children_changed");
      res.json(child);
    } catch (e) {
      res.status(500).json({ error: "Failed to create child" });
    }
  });

  app.patch("/api/children/:id/photo", async (req: Request, res: Response) => {
    try {
      const { photo } = req.body;
      await query("UPDATE children SET photo = $1 WHERE id = $2", [photo, req.params.id]);
      broadcastUpdate("children_changed");
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to update photo" });
    }
  });

  app.get("/api/categories", async (req: Request, res: Response) => {
    try {
      const childId = req.query.childId as string | undefined;
      const rows = childId
        ? await query(
            `SELECT id, child_id as "childId", name, section, active, created_at as "createdAt"
             FROM behavior_categories WHERE child_id = $1 AND active = true ORDER BY created_at`,
            [childId],
          )
        : await query(
            `SELECT id, child_id as "childId", name, section, active, created_at as "createdAt"
             FROM behavior_categories WHERE active = true ORDER BY created_at`,
          );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch categories" });
    }
  });

  app.post("/api/categories", async (req: Request, res: Response) => {
    try {
      const { id, childId, name, section, active, createdAt } = req.body;
      const catId = id || randomUUID();
      const rows = await query(
        `INSERT INTO behavior_categories (id, child_id, name, section, active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING
         RETURNING id, child_id as "childId", name, section, active, created_at as "createdAt"`,
        [catId, childId, name, section || null, active !== false, createdAt || new Date().toISOString()],
      );
      res.json(rows[0] || { id: catId, childId, name, section, active: true, createdAt });
    } catch (e) {
      res.status(500).json({ error: "Failed to create category" });
    }
  });

  app.delete("/api/categories/:id", async (req: Request, res: Response) => {
    try {
      await query("UPDATE behavior_categories SET active = false WHERE id = $1", [req.params.id]);
      broadcastUpdate("categories_changed");
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete category" });
    }
  });

  app.get("/api/entries", async (req: Request, res: Response) => {
    try {
      const childId = req.query.childId as string | undefined;
      const since = req.query.since as string | undefined;

      let sql = `SELECT e.id, e.child_id as "childId", e.category_id as "categoryId", e.status,
                        e.points_awarded as "pointsAwarded", e.recorded_by as "recordedBy",
                        e.recorded_at as "recordedAt"
                 FROM behavior_entries e`;
      const params: any[] = [];
      const conditions: string[] = [];

      if (childId) {
        params.push(childId);
        conditions.push(`e.child_id = $${params.length}`);
      }
      if (since) {
        params.push(since);
        conditions.push(`e.recorded_at > $${params.length}`);
      }
      if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
      sql += ` ORDER BY e.recorded_at DESC`;

      const rows = await query(sql, params);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch entries" });
    }
  });

  app.post("/api/entries", async (req: Request, res: Response) => {
    try {
      const { childId, categoryId, status, recordedBy } = req.body;

      const cats = await query(
        "SELECT section FROM behavior_categories WHERE id = $1",
        [categoryId],
      );
      const section = cats[0]?.section;
      const weights = getSectionWeights(section);
      const pointsAwarded = status === "SMILEY" ? weights.smiley : weights.sad;

      const id = randomUUID();
      const rows = await query(
        `INSERT INTO behavior_entries (id, child_id, category_id, status, points_awarded, recorded_by, recorded_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING id, child_id as "childId", category_id as "categoryId", status,
                   points_awarded as "pointsAwarded", recorded_by as "recordedBy",
                   recorded_at as "recordedAt"`,
        [id, childId, categoryId, status, pointsAwarded, recordedBy],
      );

      broadcastUpdate("entries_changed", { childId });
      res.json(rows[0]);
    } catch (e) {
      console.error("Add entry error:", e);
      res.status(500).json({ error: "Failed to add entry" });
    }
  });

  app.delete("/api/entries/:id", async (req: Request, res: Response) => {
    try {
      const rows = await query(
        "DELETE FROM behavior_entries WHERE id = $1 RETURNING child_id as \"childId\"",
        [req.params.id],
      );
      if (rows[0]) broadcastUpdate("entries_changed", { childId: rows[0].childId });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete entry" });
    }
  });

  app.get("/api/documents", async (req: Request, res: Response) => {
    try {
      const childId = req.query.childId as string | undefined;
      const sql = `SELECT id, child_id as "childId", uploaded_by as "uploadedBy",
                    file_name as "fileName", file_type as "fileType", created_at as "createdAt",
                    ai_insights as "aiInsights"
             FROM documents ${childId ? 'WHERE child_id = $1' : ''} ORDER BY created_at DESC`;
      const rows = childId ? await query(sql, [childId]) : await query(sql);
      const result = rows.map((r: any) => ({
        ...r,
        thumbnailUrl: `/api/documents/${r.id}/thumbnail`,
        imageUrl: `/api/documents/${r.id}/image`,
      }));
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch documents" });
    }
  });

  app.post("/api/documents", async (req: Request, res: Response) => {
    try {
      const { childId, uploadedBy, fileUri, fileName, fileType } = req.body;
      const id = randomUUID();
      let thumb: string | null = null;
      if (fileType?.startsWith('image')) {
        thumb = await generateThumbnail(fileUri);
      }
      const rows = await query(
        `INSERT INTO documents (id, child_id, uploaded_by, file_uri, file_name, file_type, thumbnail)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, child_id as "childId", uploaded_by as "uploadedBy",
                   file_name as "fileName", file_type as "fileType", created_at as "createdAt"`,
        [id, childId, uploadedBy, fileUri, fileName, fileType, thumb],
      );
      const doc = rows[0];
      doc.thumbnailUrl = `/api/documents/${id}/thumbnail`;
      doc.imageUrl = `/api/documents/${id}/image`;
      broadcastUpdate("documents_changed", { childId });
      res.json(doc);
    } catch (e) {
      res.status(500).json({ error: "Failed to add document" });
    }
  });

  app.delete("/api/documents/:id", async (req: Request, res: Response) => {
    try {
      await query("DELETE FROM documents WHERE id = $1", [req.params.id]);
      broadcastUpdate("documents_changed");
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "Failed to delete document" });
    }
  });

  app.get("/api/documents/:id/thumbnail", async (req: Request, res: Response) => {
    try {
      const rows = await query(
        `SELECT thumbnail, file_uri as "fileUri", file_type as "fileType" FROM documents WHERE id = $1`,
        [req.params.id],
      );
      if (!rows[0]) return res.status(404).end();
      const doc = rows[0];

      let thumbData = doc.thumbnail;
      if (!thumbData && doc.fileUri && doc.fileType?.startsWith('image')) {
        thumbData = await generateThumbnail(doc.fileUri);
        if (thumbData) {
          await query(`UPDATE documents SET thumbnail = $1 WHERE id = $2`, [thumbData, req.params.id]);
        }
      }

      if (thumbData) {
        const raw = thumbData.split(",")[1];
        const buf = Buffer.from(raw, "base64");
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400, immutable");
        res.setHeader("Content-Length", buf.length);
        return res.end(buf);
      }

      if (doc.fileUri) {
        const raw = doc.fileUri.startsWith("data:") ? doc.fileUri.split(",")[1] : doc.fileUri;
        const buf = Buffer.from(raw, "base64");
        const mime = doc.fileType || "application/octet-stream";
        res.setHeader("Content-Type", mime);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.setHeader("Content-Length", buf.length);
        return res.end(buf);
      }

      res.status(404).end();
    } catch (e) {
      res.status(500).json({ error: "Failed to serve thumbnail" });
    }
  });

  app.get("/api/documents/:id/image", async (req: Request, res: Response) => {
    try {
      const rows = await query(
        `SELECT file_uri as "fileUri", file_type as "fileType" FROM documents WHERE id = $1`,
        [req.params.id],
      );
      if (!rows[0] || !rows[0].fileUri) return res.status(404).end();
      const { fileUri, fileType } = rows[0];
      const raw = fileUri.startsWith("data:") ? fileUri.split(",")[1] : fileUri;
      const buf = Buffer.from(raw, "base64");
      const mime = fileType || "application/octet-stream";
      res.setHeader("Content-Type", mime);
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.setHeader("Content-Length", buf.length);
      res.end(buf);
    } catch (e) {
      res.status(500).json({ error: "Failed to serve image" });
    }
  });

  app.post("/api/documents/:id/analyze", async (req: Request, res: Response) => {
    try {
      let { base64Data, fileType, childName } = req.body;
      if (!base64Data) {
        const rows = await query(`SELECT file_uri as "fileUri", file_type as "fileType" FROM documents WHERE id = $1`, [req.params.id]);
        if (!rows[0]?.fileUri) return res.status(400).json({ error: "No document data found" });
        base64Data = rows[0].fileUri;
        if (!fileType) fileType = rows[0].fileType;
      }

      const systemPrompt = `You are a helpful pediatric health assistant. Analyze medical documents and provide clear, plain-language insights for parents. Focus on: key findings, what they mean for the child's health, any action items or follow-ups, and reassuring context where appropriate. Be concise and avoid medical jargon where possible. The child's name is ${childName || 'the child'}.`;
      const userPrompt = "Please analyze this medical document and provide insights about what it says regarding the child's health. Include key findings, what they mean, and any recommended actions for parents.";

      let insights: string;
      const isPdf = fileType === 'application/pdf';

      if (isPdf) {
        // Render PDF pages as images using pdftoppm, then analyze with Vision API
        const images = await pdfToImages(base64Data);
        if (images.length === 0) {
          insights = "Could not render this PDF. Please try uploading a photo (JPG/PNG) of the document instead.";
        } else {
          const imageContent = images.map((img) => ({
            type: "image_url" as const,
            image_url: { url: img, detail: "high" as const },
          }));
          const completion = await openai.chat.completions.create({
            model: "gpt-4.1",
            max_tokens: 1500,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: [
                  ...imageContent,
                  { type: "text" as const, text: userPrompt },
                ],
              },
            ],
          });
          insights = completion.choices[0]?.message?.content || "Unable to analyze this document.";
        }
      } else {
        // Use Vision API for images
        const mediaType = fileType?.startsWith('image/') ? fileType : 'image/jpeg';
        const dataUrl = base64Data.startsWith('data:')
          ? base64Data
          : `data:${mediaType};base64,${base64Data}`;
        const completion = await openai.chat.completions.create({
          model: "gpt-4.1",
          max_tokens: 1000,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
                { type: "text", text: userPrompt },
              ],
            },
          ],
        });
        insights = completion.choices[0]?.message?.content || "Unable to analyze this document.";
      }

      await query(
        "UPDATE documents SET ai_insights = $1 WHERE id = $2",
        [insights, req.params.id],
      );

      broadcastUpdate("documents_changed");
      res.json({ insights });
    } catch (e: any) {
      console.error("Document analysis error:", e);
      res.status(500).json({ error: e?.message || "Failed to analyze document" });
    }
  });

  app.post("/api/medical-records/:id/analyze", async (req: Request, res: Response) => {
    try {
      const { childName } = req.body;
      const rows = await query(
        `SELECT id, resource_type as "resourceType", display_name as "displayName", category, status, record_date as "recordDate", details FROM medical_records WHERE id = $1`,
        [req.params.id],
      );
      if (!rows[0]) return res.status(404).json({ error: "Medical record not found" });
      const rec = rows[0];

      const systemPrompt = `You are a helpful pediatric health assistant. Analyze medical records and provide clear, plain-language insights for parents. Focus on: what this record means, any action items, and reassuring context where appropriate. Be concise and avoid jargon. The child's name is ${childName || 'the child'}.`;

      const recordSummary = [
        `Record Type: ${rec.resourceType}`,
        `Category: ${rec.category}`,
        `Name: ${rec.displayName}`,
        rec.status ? `Status: ${rec.status}` : null,
        rec.recordDate ? `Date: ${rec.recordDate}` : null,
        rec.details ? `Details: ${JSON.stringify(rec.details)}` : null,
      ].filter(Boolean).join('\n');

      const completion = await openai.chat.completions.create({
        model: "gpt-4.1",
        max_tokens: 1000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Please analyze this medical record and explain what it means for the child's health. Provide key findings, what they mean, and any recommended actions for parents.\n\n${recordSummary}` },
        ],
      });

      const insights = completion.choices[0]?.message?.content || "Unable to analyze this record.";

      await query("UPDATE medical_records SET ai_insights = $1 WHERE id = $2", [insights, req.params.id]);
      broadcastUpdate("medical_records_changed");
      res.json({ insights });
    } catch (e: any) {
      console.error("Medical record analysis error:", e);
      res.status(500).json({ error: e?.message || "Failed to analyze record" });
    }
  });

  app.post("/api/seed", async (req: Request, res: Response) => {
    try {
      const existing = await query("SELECT id FROM children WHERE last_name = 'McClary'");
      if (existing.length > 0) {
        return res.json({ seeded: false, children: existing });
      }

      const isaacId = randomUUID();
      const isaiahId = randomUUID();

      await query(
        `INSERT INTO children (id, first_name, last_name, date_of_birth) VALUES
         ($1, 'Isaac', 'McClary', '2024-01-11'),
         ($2, 'Isaiah', 'McClary', '2022-10-29')`,
        [isaacId, isaiahId],
      );

      const catInserts = [];
      for (const item of ROUTINE_ITEMS) {
        for (const childId of [isaacId, isaiahId]) {
          catInserts.push(`('${randomUUID()}', '${childId}', '${item.name.replace(/'/g, "''")}', '${item.section.replace(/'/g, "''")}', true, NOW())`);
        }
      }

      await query(
        `INSERT INTO behavior_categories (id, child_id, name, section, active, created_at) VALUES ${catInserts.join(',')}`,
      );

      const children = await query(
        `SELECT id, first_name as "firstName", last_name as "lastName", date_of_birth as "dateOfBirth", photo, created_at as "createdAt"
         FROM children WHERE last_name = 'McClary'`,
      );

      broadcastUpdate("children_changed");
      res.json({ seeded: true, children });
    } catch (e) {
      console.error("Seed error:", e);
      res.status(500).json({ error: "Seed failed" });
    }
  });

  app.post("/api/seed-test-patient", async (_req: Request, res: Response) => {
    try {
      const existing = await query("SELECT id FROM children WHERE first_name = 'Camila' AND last_name = 'Lopez'");
      if (existing.length > 0) {
        return res.json({ seeded: false, childId: existing[0].id });
      }

      const camilaId = randomUUID();
      await query(
        `INSERT INTO children (id, first_name, last_name, date_of_birth) VALUES ($1, 'Camila', 'Lopez', '2023-06-15')`,
        [camilaId],
      );

      const camilaCategories = [];
      for (const item of ROUTINE_ITEMS) {
        camilaCategories.push(`('${randomUUID()}', '${camilaId}', '${item.name.replace(/'/g, "''")}', '${item.section.replace(/'/g, "''")}', true, NOW())`);
      }
      await query(
        `INSERT INTO behavior_categories (id, child_id, name, section, active, created_at) VALUES ${camilaCategories.join(',')}`,
      );

      const sampleRecords = [
        { resourceType: 'Patient', fhirId: 'test-pt-camila', displayName: 'Camila Lopez', category: 'Patient Info', status: '', recordDate: '2023-06-15', details: { gender: 'female', birthDate: '2023-06-15', address: '1250 E Marshall St, Richmond, VA 23298', phone: '(804) 555-0123' } },
        { resourceType: 'DiagnosticReport', fhirId: 'test-dx-001', displayName: 'Complete Blood Count (CBC)', category: 'Diagnostic Reports', status: 'final', recordDate: '2025-12-10', details: { conclusion: 'All values within normal range for age. No abnormalities detected.', performer: 'Dr. Sarah Chen, VCU Health', resultCount: 8 } },
        { resourceType: 'DiagnosticReport', fhirId: 'test-dx-002', displayName: 'Metabolic Panel, Comprehensive', category: 'Diagnostic Reports', status: 'final', recordDate: '2025-11-15', details: { conclusion: 'Electrolytes balanced. Kidney and liver function normal.', performer: 'Dr. James Rivera, VCU Health', resultCount: 14 } },
        { resourceType: 'DiagnosticReport', fhirId: 'test-dx-003', displayName: 'Urinalysis', category: 'Diagnostic Reports', status: 'final', recordDate: '2025-10-01', details: { conclusion: 'Normal results. No signs of infection.', performer: 'Dr. Sarah Chen, VCU Health', resultCount: 5 } },
        { resourceType: 'Observation', fhirId: 'test-obs-001', displayName: 'Weight', category: 'Lab Results', status: 'final', recordDate: '2025-12-10', details: { value: '12.5 kg', referenceRange: ['10.0 kg - 15.0 kg'], interpretation: ['Normal'] } },
        { resourceType: 'Observation', fhirId: 'test-obs-002', displayName: 'Height', category: 'Lab Results', status: 'final', recordDate: '2025-12-10', details: { value: '82 cm', referenceRange: ['75 cm - 90 cm'], interpretation: ['Normal'] } },
        { resourceType: 'Observation', fhirId: 'test-obs-003', displayName: 'Head Circumference', category: 'Lab Results', status: 'final', recordDate: '2025-12-10', details: { value: '48.5 cm', referenceRange: ['46 cm - 51 cm'], interpretation: ['Normal'] } },
        { resourceType: 'Observation', fhirId: 'test-obs-004', displayName: 'Hemoglobin A1C', category: 'Lab Results', status: 'final', recordDate: '2025-11-15', details: { value: '5.1 %', referenceRange: ['4.0 % - 5.6 %'], interpretation: ['Normal'] } },
        { resourceType: 'Observation', fhirId: 'test-obs-005', displayName: 'Lead Level, Blood', category: 'Lab Results', status: 'final', recordDate: '2025-09-20', details: { value: '1.2 mcg/dL', referenceRange: ['0 mcg/dL - 3.5 mcg/dL'], interpretation: ['Normal — below CDC reference value'] } },
        { resourceType: 'MedicationRequest', fhirId: 'test-med-001', displayName: 'Amoxicillin 250mg/5mL Suspension', category: 'Medications', status: 'completed', recordDate: '2025-11-01', details: { dosage: ['5 mL by mouth twice daily for 10 days'], prescriber: 'Dr. Sarah Chen' } },
        { resourceType: 'MedicationRequest', fhirId: 'test-med-002', displayName: 'Acetaminophen 160mg/5mL', category: 'Medications', status: 'active', recordDate: '2025-12-10', details: { dosage: ['5 mL by mouth every 4-6 hours as needed for fever or pain'], prescriber: 'Dr. Sarah Chen' } },
        { resourceType: 'MedicationRequest', fhirId: 'test-med-003', displayName: 'Vitamin D3 400 IU Drops', category: 'Medications', status: 'active', recordDate: '2023-06-20', details: { dosage: ['1 drop (400 IU) by mouth daily'], prescriber: 'Dr. James Rivera' } },
        { resourceType: 'MedicationStatement', fhirId: 'test-medst-001', displayName: 'Polyvisol Multivitamin Drops', category: 'Medications', status: 'active', recordDate: '2023-08-01', details: { dosage: ['1 mL by mouth daily'] } },
        { resourceType: 'Procedure', fhirId: 'test-proc-001', displayName: '18-Month Well-Child Visit', category: 'Procedures', status: 'completed', recordDate: '2024-12-15', details: { performer: 'Dr. Sarah Chen', location: 'VCU Pediatrics — Brook Road', outcome: 'Developmental milestones on track' } },
        { resourceType: 'Procedure', fhirId: 'test-proc-002', displayName: '12-Month Well-Child Visit', category: 'Procedures', status: 'completed', recordDate: '2024-06-15', details: { performer: 'Dr. Sarah Chen', location: 'VCU Pediatrics — Brook Road', outcome: 'All immunizations up to date' } },
        { resourceType: 'Procedure', fhirId: 'test-proc-003', displayName: 'Immunization — DTaP (Dose 4)', category: 'Procedures', status: 'completed', recordDate: '2024-12-15', details: { performer: 'Nurse Thompson', location: 'VCU Pediatrics — Brook Road', outcome: 'Tolerated well, no adverse reaction' } },
        { resourceType: 'Procedure', fhirId: 'test-proc-004', displayName: 'Immunization — Influenza (2025–2026)', category: 'Procedures', status: 'completed', recordDate: '2025-10-05', details: { performer: 'Nurse Thompson', location: 'VCU Pediatrics — Brook Road', outcome: 'Mild redness at injection site, resolved in 24 hours' } },
        { resourceType: 'Goal', fhirId: 'test-goal-001', displayName: 'Reach 25th percentile for weight', category: 'Goals', status: 'in-progress', recordDate: '2025-06-15', details: { target: ['Target weight: 13.0 kg by 2-year visit'] } },
        { resourceType: 'Goal', fhirId: 'test-goal-002', displayName: 'Speech development — 50+ words', category: 'Goals', status: 'in-progress', recordDate: '2025-06-15', details: { target: ['Use at least 50 words and 2-word phrases by age 2'] } },
        { resourceType: 'Goal', fhirId: 'test-goal-003', displayName: 'Complete immunization schedule', category: 'Goals', status: 'in-progress', recordDate: '2023-06-20', details: { target: ['All recommended vaccinations by age 2'] } },
      ];

      for (const rec of sampleRecords) {
        await query(
          `INSERT INTO medical_records (id, child_id, resource_type, fhir_id, display_name, category, status, record_date, details)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [randomUUID(), camilaId, rec.resourceType, rec.fhirId, rec.displayName, rec.category, rec.status, rec.recordDate, JSON.stringify(rec.details)],
        );
      }

      broadcastUpdate("children_changed");
      console.log(`[SEED] Created test patient Camila Lopez (${camilaId}) with ${sampleRecords.length} medical records`);
      res.json({ seeded: true, childId: camilaId });
    } catch (e: any) {
      console.error("Seed test patient error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/ai-recommendations", async (req: Request, res: Response) => {
    try {
      const { childName, totalPoints, totalPossiblePoints, rewardPercent, rewardEarned, sectionBreakdown, daysIntoWeek } = req.body;

      const sectionText = sectionBreakdown
        .map((s: any) => {
          const pct = s.possiblePoints > 0 ? Math.round((s.points / s.possiblePoints) * 100) : 0;
          return `- ${s.section}: ${s.points} of ${s.possiblePoints} points (${pct}%) — ${s.smileyCount} happy, ${s.sadCount} sad`;
        })
        .join("\n");

      const weekPosition = daysIntoWeek <= 2 ? "at the beginning of the week" : daysIntoWeek >= 5 ? "near the end of the week" : "in the middle of the week";
      const pointsNeeded = totalPossiblePoints > 0 ? Math.ceil(totalPossiblePoints * 0.8) - totalPoints : 0;

      const prompt = `You are a supportive child behavior coach helping co-parents track and improve their children's behavior. Analyze this weekly behavior report and provide helpful, warm, and practical guidance.

Child: ${childName}
Week position: ${weekPosition} (day ${daysIntoWeek} of 7)
Total score: ${totalPoints} of ${totalPossiblePoints} possible points (${rewardPercent}%)
Weekly reward (80% threshold): ${rewardEarned ? "EARNED ✓" : `NOT YET — needs ${Math.max(0, pointsNeeded)} more points`}

Behavior breakdown by section:
${sectionText || "No entries logged yet this week."}

Please provide a response in exactly this format with these three sections:

**Overall Assessment**
2-3 sentences summarizing how ${childName} is doing this week. Be warm and encouraging while being honest.

**Areas to Improve**
Give 2-3 specific, actionable suggestions for the sections where ${childName} scored lowest or had the most sad faces. Be concrete and practical for a young child.

**Tips to Hit the 80% Goal**
${rewardEarned
  ? `${childName} already earned the reward! Give 2 tips to maintain this strong performance through the rest of the week.`
  : `Give 2-3 specific tips tailored to ${weekPosition} to help ${childName} reach the 80% reward threshold. Focus on the highest-weight sections (Daycare = 3pts, Sibling Interactions = 2pts, Routines = 1pt each).`
}

Keep the tone positive, supportive, and parent-friendly. Use simple language. Each section should be 2-4 sentences max.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 600,
      });

      const content = response.choices[0]?.message?.content || "";
      res.json({ recommendations: content });
    } catch (error) {
      console.error("AI recommendations error:", error);
      res.status(500).json({ error: "Failed to generate recommendations" });
    }
  });

  app.post("/api/epic/summarize", async (req: Request, res: Response) => {
    try {
      const { encounters } = req.body;
      if (!encounters || encounters.length === 0) return res.json({ summaries: {} });

      const summaries: Record<string, string> = {};
      await Promise.all(
        encounters.map(async (enc: any) => {
          try {
            const response = await openai.chat.completions.create({
              model: "gpt-4.1",
              messages: [{
                role: "user",
                content: `You are a friendly healthcare assistant helping a parent understand their child's medical visit. Convert the following clinical visit data into a concise, parent-friendly 2-3 sentence summary. Avoid medical jargon.\n\nDate: ${enc.date}\nType: ${enc.type}\nProvider: ${enc.provider}\nDetails: ${enc.rawText}\n\nRespond with just the plain-English summary.`,
              }],
              max_tokens: 150,
            });
            summaries[enc.id] = response.choices[0]?.message?.content?.trim() || "";
          } catch { summaries[enc.id] = ""; }
        }),
      );
      res.json({ summaries });
    } catch (error) {
      res.status(500).json({ error: "Failed to summarize encounters" });
    }
  });

  await registerFhirRoutes(app);

  const httpServer = createServer(app);
  return httpServer;
}
