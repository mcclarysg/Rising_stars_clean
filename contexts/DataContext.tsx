import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback, ReactNode } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { fetch } from 'expo/fetch';
import { apiRequest, getApiUrl } from '@/lib/query-client';
import { getSectionWeights, getWeeklySummaryFromEntries, type Child, type BehaviorCategory, type BehaviorEntry, type BehaviorStatus, type Document, type Appointment, type MedicalRecord } from '@/lib/storage';
import { useAuth } from './AuthContext';

interface DataContextValue {
  children: Child[];
  categories: BehaviorCategory[];
  entries: BehaviorEntry[];
  documents: Document[];
  appointments: Appointment[];
  medicalRecords: MedicalRecord[];
  isLoading: boolean;
  addChild: (firstName: string, lastName: string, dob: string) => Promise<Child>;
  updateChildPhoto: (childId: string, photoUri: string) => Promise<void>;
  addCategory: (childId: string, name: string) => Promise<BehaviorCategory>;
  removeCategory: (categoryId: string) => Promise<void>;
  addBehaviorEntry: (childId: string, categoryId: string, status: BehaviorStatus) => Promise<BehaviorEntry>;
  removeBehaviorEntry: (entryId: string) => Promise<void>;
  addDoc: (childId: string, fileUri: string, fileName: string, fileType: string) => Promise<Document>;
  removeDoc: (docId: string) => Promise<void>;
  analyzeDoc: (docId: string, childName: string) => Promise<string>;
  analyzeMedicalRecord: (recordId: string, childName: string) => Promise<string>;
  addAppointment: (appt: Omit<Appointment, 'id' | 'createdAt'>) => Promise<Appointment>;
  removeAppointment: (apptId: string) => Promise<void>;
  getChildWeeklySummary: (childId: string) => ReturnType<typeof getWeeklySummaryFromEntries>;
  refreshData: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

async function apiFetch<T>(path: string): Promise<T> {
  const res = await apiRequest('GET', path);
  return res.json();
}

export function DataProvider({ children: childrenProp }: { children: ReactNode }) {
  const { user } = useAuth();
  const [childrenData, setChildrenData] = useState<Child[]>([]);
  const [categories, setCategories] = useState<BehaviorCategory[]>([]);
  const [entries, setEntries] = useState<BehaviorEntry[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [medicalRecords, setMedicalRecords] = useState<MedicalRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const sseRef = useRef<AbortController | null>(null);

  const refreshData = useCallback(async () => {
    try {
      const [c, cat, e, d, a] = await Promise.all([
        apiFetch<Child[]>('/api/children'),
        apiFetch<BehaviorCategory[]>('/api/categories'),
        apiFetch<BehaviorEntry[]>('/api/entries'),
        apiFetch<Document[]>('/api/documents'),
        apiFetch<Appointment[]>('/api/appointments'),
      ]);
      let mr: MedicalRecord[] = [];
      try { mr = await apiFetch<MedicalRecord[]>('/api/medical-records'); } catch {}
      setChildrenData(c);
      setCategories(cat);
      setEntries(e);
      setDocuments(d);
      setAppointments(a);
      setMedicalRecords(mr);
    } catch (err) {
      console.error('refreshData error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const seedIfNeeded = useCallback(async () => {
    try {
      await apiRequest('POST', '/api/seed', {});
    } catch {}
  }, []);

  const connectSSE = useCallback(() => {
    if (sseRef.current) sseRef.current.abort();
    const controller = new AbortController();
    sseRef.current = controller;

    (async () => {
      try {
        const baseUrl = getApiUrl();
        const url = new URL('/api/events', baseUrl).toString();
        const res = await fetch(url, {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        });

        const reader = res.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data:')) {
              try {
                const payload = JSON.parse(line.slice(5).trim());
                if (payload.type && payload.type !== 'ping') {
                  refreshData();
                }
              } catch {}
            }
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setTimeout(() => connectSSE(), 5000);
        }
      }
    })();
  }, [refreshData]);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    seedIfNeeded().then(() => refreshData());
    connectSSE();

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        refreshData();
        connectSSE();
      }
    });

    return () => {
      sseRef.current?.abort();
      sub.remove();
    };
  }, [user]);

  const addChild = useCallback(async (firstName: string, lastName: string, dob: string) => {
    const res = await apiRequest('POST', '/api/children', { firstName, lastName, dateOfBirth: dob });
    const child: Child = await res.json();
    setChildrenData((prev) => [...prev.filter((c) => c.id !== child.id), child]);
    return child;
  }, []);

  const updateChildPhoto = useCallback(async (childId: string, photoUri: string) => {
    await apiRequest('PATCH', `/api/children/${childId}/photo`, { photo: photoUri });
    setChildrenData((prev) => prev.map((c) => c.id === childId ? { ...c, photo: photoUri } : c));
  }, []);

  const addCategory = useCallback(async (childId: string, name: string) => {
    const res = await apiRequest('POST', '/api/categories', { childId, name });
    const cat: BehaviorCategory = await res.json();
    setCategories((prev) => [...prev, cat]);
    return cat;
  }, []);

  const removeCategory = useCallback(async (categoryId: string) => {
    await apiRequest('DELETE', `/api/categories/${categoryId}`);
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
  }, []);

  const addBehaviorEntry = useCallback(async (childId: string, categoryId: string, status: BehaviorStatus) => {
    if (!user) throw new Error('Must be logged in');
    const res = await apiRequest('POST', '/api/entries', { childId, categoryId, status, recordedBy: user.id });
    const entry: BehaviorEntry = await res.json();
    setEntries((prev) => [...prev, entry]);
    return entry;
  }, [user]);

  const removeBehaviorEntry = useCallback(async (entryId: string) => {
    await apiRequest('DELETE', `/api/entries/${entryId}`);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }, []);

  const addDoc = useCallback(async (childId: string, fileUri: string, fileName: string, fileType: string) => {
    if (!user) throw new Error('Must be logged in');
    const res = await apiRequest('POST', '/api/documents', { childId, uploadedBy: user.id, fileUri, fileName, fileType });
    const doc: Document = await res.json();
    setDocuments((prev) => [...prev, doc]);
    return doc;
  }, [user]);

  const removeDoc = useCallback(async (docId: string) => {
    await apiRequest('DELETE', `/api/documents/${docId}`);
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
  }, []);

  const analyzeDoc = useCallback(async (docId: string, childName: string): Promise<string> => {
    const res = await apiRequest('POST', `/api/documents/${docId}/analyze`, { childName });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setDocuments((prev) => prev.map((d) => d.id === docId ? { ...d, aiInsights: data.insights } : d));
    return data.insights as string;
  }, []);

  const analyzeMedicalRecord = useCallback(async (recordId: string, childName: string): Promise<string> => {
    const res = await apiRequest('POST', `/api/medical-records/${recordId}/analyze`, { childName });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setMedicalRecords((prev) => prev.map((r) => r.id === recordId ? { ...r, aiInsights: data.insights } : r));
    return data.insights as string;
  }, []);

  const addAppointment = useCallback(async (appt: Omit<Appointment, 'id' | 'createdAt'>) => {
    const res = await apiRequest('POST', '/api/appointments', appt);
    const newAppt: Appointment = await res.json();
    setAppointments((prev) => [...prev, newAppt].sort((a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime()));
    return newAppt;
  }, []);

  const removeAppointment = useCallback(async (apptId: string) => {
    await apiRequest('DELETE', `/api/appointments/${apptId}`);
    setAppointments((prev) => prev.filter((a) => a.id !== apptId));
  }, []);

  const getChildWeeklySummary = useCallback((childId: string) => {
    const childEntries = entries.filter((e) => e.childId === childId);
    const childCategories = categories.filter((c) => c.childId === childId);
    return getWeeklySummaryFromEntries(childId, childEntries, childCategories);
  }, [entries, categories]);

  const value = useMemo(() => ({
    children: childrenData,
    categories,
    entries,
    documents,
    appointments,
    medicalRecords,
    isLoading,
    addChild,
    updateChildPhoto,
    addCategory,
    removeCategory,
    addBehaviorEntry,
    removeBehaviorEntry,
    addDoc,
    removeDoc,
    analyzeDoc,
    analyzeMedicalRecord,
    addAppointment,
    removeAppointment,
    getChildWeeklySummary,
    refreshData,
  }), [childrenData, categories, entries, documents, appointments, medicalRecords, isLoading, addChild, updateChildPhoto, addCategory, removeCategory, addBehaviorEntry, removeBehaviorEntry, addDoc, removeDoc, analyzeDoc, analyzeMedicalRecord, addAppointment, removeAppointment, getChildWeeklySummary, refreshData]);

  return <DataContext.Provider value={value}>{childrenProp}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}
