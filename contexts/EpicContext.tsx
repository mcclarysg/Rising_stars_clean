import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const VCU_MYCHART_BASE = 'https://mychart.vcuhealth.org';
const EPIC_AUTH_URL = `${VCU_MYCHART_BASE}/MyChart/oauth2/authorize`;
const EPIC_TOKEN_URL = `${VCU_MYCHART_BASE}/MyChart/oauth2/token`;
export const EPIC_FHIR_BASE = `${VCU_MYCHART_BASE}/FHIR/api/FHIR/R4`;

const EPIC_SCOPES = [
  'openid',
  'fhirUser',
  'launch/patient',
  'patient/Appointment.read',
  'patient/DocumentReference.read',
  'patient/Encounter.read',
  'patient/Condition.read',
  'patient/Observation.read',
  'offline_access',
].join(' ');

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'epic_access_token',
  REFRESH_TOKEN: 'epic_refresh_token',
  PATIENT_ID: 'epic_patient_id',
  TOKEN_EXPIRY: 'epic_token_expiry',
};

export interface EpicAppointment {
  id: string;
  date: string;
  time: string;
  provider: string;
  location: string;
  status: string;
  description: string;
  isUpcoming: boolean;
}

export interface EpicDocument {
  id: string;
  title: string;
  date: string;
  category: string;
  status: string;
}

export interface EpicEncounterSummary {
  id: string;
  date: string;
  type: string;
  provider: string;
  rawText: string;
  aiSummary?: string;
}

interface EpicContextValue {
  isConnected: boolean;
  isConnecting: boolean;
  isLoading: boolean;
  clientId: string;
  appointments: EpicAppointment[];
  documents: EpicDocument[];
  encounters: EpicEncounterSummary[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
  error: string | null;
}

const EpicContext = createContext<EpicContextValue | null>(null);

function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  const chunk = 1024;
  for (let i = 0; i < bytes.length; i += chunk) {
    str += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  Crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const base64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function parseAppointments(bundle: any): EpicAppointment[] {
  if (!bundle?.entry) return [];
  const now = new Date();
  return bundle.entry
    .filter((e: any) => e.resource?.resourceType === 'Appointment')
    .map((e: any) => {
      const r = e.resource;
      const start = r.start ? new Date(r.start) : null;
      const participant = r.participant?.find(
        (p: any) => p.actor?.reference?.startsWith('Practitioner'),
      );
      const location = r.participant?.find(
        (p: any) => p.actor?.reference?.startsWith('Location'),
      );
      return {
        id: r.id,
        date: start ? start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date',
        time: start ? start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '',
        provider: participant?.actor?.display || 'Provider',
        location: location?.actor?.display || r.serviceType?.[0]?.text || 'Clinic',
        status: r.status || 'booked',
        description: r.serviceType?.[0]?.text || r.appointmentType?.coding?.[0]?.display || 'Appointment',
        isUpcoming: start ? start > now : false,
      };
    })
    .sort((a: EpicAppointment, b: EpicAppointment) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      return da - db;
    });
}

function parseDocuments(bundle: any): EpicDocument[] {
  if (!bundle?.entry) return [];
  return bundle.entry
    .filter((e: any) => e.resource?.resourceType === 'DocumentReference')
    .map((e: any) => {
      const r = e.resource;
      const date = r.date ? new Date(r.date) : null;
      return {
        id: r.id,
        title: r.description || r.type?.text || r.type?.coding?.[0]?.display || 'Document',
        date: date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown',
        category: r.category?.[0]?.text || r.category?.[0]?.coding?.[0]?.display || 'General',
        status: r.status || 'current',
      };
    })
    .sort((a: EpicDocument, b: EpicDocument) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function parseEncounters(bundle: any): EpicEncounterSummary[] {
  if (!bundle?.entry) return [];
  return bundle.entry
    .filter((e: any) => e.resource?.resourceType === 'Encounter')
    .map((e: any) => {
      const r = e.resource;
      const date = r.period?.start ? new Date(r.period.start) : null;
      const provider = r.participant?.[0]?.individual?.display || 'Provider';
      const type = r.type?.[0]?.text || r.type?.[0]?.coding?.[0]?.display || 'Visit';
      const rawParts = [
        `Type: ${type}`,
        `Provider: ${provider}`,
        r.reasonCode?.[0]?.text ? `Reason: ${r.reasonCode[0].text}` : null,
        r.diagnosis?.[0]?.condition?.display ? `Diagnosis: ${r.diagnosis[0].condition.display}` : null,
      ].filter(Boolean);
      return {
        id: r.id,
        date: date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown',
        type,
        provider,
        rawText: rawParts.join('\n'),
      };
    })
    .sort((a: EpicEncounterSummary, b: EpicEncounterSummary) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);
}

export function EpicProvider({ children }: { children: ReactNode }) {
  const clientId = process.env.EXPO_PUBLIC_EPIC_CLIENT_ID || '';
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<EpicAppointment[]>([]);
  const [documents, setDocuments] = useState<EpicDocument[]>([]);
  const [encounters, setEncounters] = useState<EpicEncounterSummary[]>([]);

  const getStoredToken = async (): Promise<string | null> => {
    try {
      if (Platform.OS === 'web') {
        return sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      }
      return await SecureStore.getItemAsync(STORAGE_KEYS.ACCESS_TOKEN);
    } catch {
      return null;
    }
  };

  const storeTokens = async (accessToken: string, refreshToken: string, patientId: string, expiresIn: number) => {
    const expiry = Date.now() + expiresIn * 1000;
    if (Platform.OS === 'web') {
      sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
      sessionStorage.setItem(STORAGE_KEYS.PATIENT_ID, patientId);
      sessionStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, String(expiry));
    } else {
      await SecureStore.setItemAsync(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
      await SecureStore.setItemAsync(STORAGE_KEYS.REFRESH_TOKEN, refreshToken || '');
      await SecureStore.setItemAsync(STORAGE_KEYS.PATIENT_ID, patientId);
      await SecureStore.setItemAsync(STORAGE_KEYS.TOKEN_EXPIRY, String(expiry));
    }
  };

  const clearTokens = async () => {
    if (Platform.OS === 'web') {
      Object.values(STORAGE_KEYS).forEach((k) => sessionStorage.removeItem(k));
    } else {
      await Promise.all(Object.values(STORAGE_KEYS).map((k) => SecureStore.deleteItemAsync(k)));
    }
  };

  const fetchFhir = async (path: string, token: string) => {
    const res = await fetch(`${EPIC_FHIR_BASE}/${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/fhir+json',
      },
    });
    if (!res.ok) throw new Error(`FHIR ${path} failed: ${res.status}`);
    return res.json();
  };

  const loadData = useCallback(async () => {
    const token = await getStoredToken();
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      let patientId = Platform.OS === 'web'
        ? sessionStorage.getItem(STORAGE_KEYS.PATIENT_ID)
        : await SecureStore.getItemAsync(STORAGE_KEYS.PATIENT_ID);

      const [apptBundle, docBundle, encBundle] = await Promise.all([
        fetchFhir(`Appointment?patient=${patientId}&_count=20&_sort=date`, token).catch(() => null),
        fetchFhir(`DocumentReference?patient=${patientId}&_count=20&_sort=-date`, token).catch(() => null),
        fetchFhir(`Encounter?patient=${patientId}&_count=10&_sort=-date`, token).catch(() => null),
      ]);

      setAppointments(parseAppointments(apptBundle));
      setDocuments(parseDocuments(docBundle));

      const parsedEncounters = parseEncounters(encBundle);
      setEncounters(parsedEncounters);

      if (parsedEncounters.length > 0) {
        enrichEncountersWithAI(parsedEncounters, token, patientId || '');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load health data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const enrichEncountersWithAI = async (encs: EpicEncounterSummary[], token: string, patientId: string) => {
    try {
      const { apiRequest } = await import('@/lib/query-client');
      const res = await apiRequest('POST', '/api/epic/summarize', {
        encounters: encs.map((e) => ({ id: e.id, date: e.date, type: e.type, provider: e.provider, rawText: e.rawText })),
      });
      const data = await res.json();
      if (data.summaries) {
        setEncounters((prev) =>
          prev.map((e) => ({
            ...e,
            aiSummary: data.summaries[e.id] || e.aiSummary,
          })),
        );
      }
    } catch {
    }
  };

  useEffect(() => {
    (async () => {
      const token = await getStoredToken();
      if (token) {
        setIsConnected(true);
        loadData();
      }
    })();
  }, []);

  const connect = async () => {
    if (!clientId) {
      setError('VCU Health Client ID not configured. See the setup steps above.');
      return;
    }
    setIsConnecting(true);
    setError(null);
    try {
      const redirectUri = Linking.createURL('health');
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      const state = base64UrlEncode(Crypto.getRandomValues(new Uint8Array(16)));

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: EPIC_SCOPES,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        aud: EPIC_FHIR_BASE,
      });

      const authUrl = `${EPIC_AUTH_URL}?${params.toString()}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

      if (result.type !== 'success') {
        setIsConnecting(false);
        return;
      }

      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      if (!code || returnedState !== state) {
        throw new Error('Invalid authorization response');
      }

      const tokenRes = await fetch(EPIC_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_verifier: verifier,
        }).toString(),
      });

      if (!tokenRes.ok) {
        const text = await tokenRes.text();
        throw new Error(`Token exchange failed: ${text}`);
      }

      const tokenData = await tokenRes.json();
      const patientId = tokenData.patient || '';
      await storeTokens(tokenData.access_token, tokenData.refresh_token || '', patientId, tokenData.expires_in || 3600);
      setIsConnected(true);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Connection failed');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    await clearTokens();
    setIsConnected(false);
    setAppointments([]);
    setDocuments([]);
    setEncounters([]);
    setError(null);
  };

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  return (
    <EpicContext.Provider value={{ isConnected, isConnecting, isLoading, clientId, appointments, documents, encounters, connect, disconnect, refresh, error }}>
      {children}
    </EpicContext.Provider>
  );
}

export function useEpic() {
  const ctx = useContext(EpicContext);
  if (!ctx) throw new Error('useEpic must be used within EpicProvider');
  return ctx;
}
