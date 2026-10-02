import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

const USER_KEY = 'coparent_user';

export type UserRole = 'PARENT' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: string;
}

export interface Child {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  photo?: string;
  createdAt: string;
}

export interface BehaviorCategory {
  id: string;
  childId: string;
  name: string;
  section?: string;
  active: boolean;
  createdAt: string;
}

export type BehaviorStatus = 'SMILEY' | 'SAD';

export interface BehaviorEntry {
  id: string;
  childId: string;
  categoryId: string;
  status: BehaviorStatus;
  pointsAwarded: number;
  recordedBy: string;
  recordedAt: string;
}

export interface Document {
  id: string;
  childId: string;
  uploadedBy: string;
  fileUri?: string;
  fileName: string;
  fileType: string;
  createdAt: string;
  aiInsights?: string;
  thumbnailUrl?: string;
  imageUrl?: string;
}

export interface Appointment {
  id: string;
  childId?: string;
  title: string;
  provider?: string;
  location?: string;
  appointmentDate: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

export interface MedicalRecord {
  id: string;
  childId: string;
  resourceType: string;
  fhirId?: string;
  displayName: string;
  category: string;
  status?: string;
  recordDate?: string;
  details: Record<string, any>;
  aiInsights?: string;
  createdAt: string;
}

export type DocCategory = 'results' | 'letters' | 'summary';

export function getDocCategory(fileName: string): DocCategory {
  const n = fileName.toLowerCase();
  if (/immuniz|vaccin|lab\b|result|blood|test|screen|culture|x.ray|imaging|pathol/.test(n)) return 'results';
  if (/letter|referral|discharge|authoriz|prior.auth|permission|consult/.test(n)) return 'letters';
  return 'summary';
}

export interface SectionSummary {
  section: string;
  points: number;
  possiblePoints: number;
  smileyCount: number;
  sadCount: number;
}

export function getSectionWeights(section?: string): { smiley: number; sad: number; possible: number } {
  if (section === 'Sibling Interactions') return { smiley: 2, sad: -2, possible: 2 };
  if (section === 'Daycare Report') return { smiley: 3, sad: -3, possible: 3 };
  return { smiley: 1, sad: 0, possible: 1 };
}

export function getWeeklySummaryFromEntries(
  childId: string,
  entries: BehaviorEntry[],
  categories: BehaviorCategory[],
) {
  const now = new Date();
  const startOfWeek = new Date(now);
  const dayOfWeek = now.getDay();
  const daysSinceSaturday = (dayOfWeek + 1) % 7;
  startOfWeek.setDate(now.getDate() - daysSinceSaturday);
  startOfWeek.setHours(0, 0, 0, 0);

  const weekEntries = entries.filter(
    (e) => e.childId === childId && new Date(e.recordedAt) >= startOfWeek,
  );

  let totalPoints = 0;
  let totalPossiblePoints = 0;
  const sectionMap: Record<string, SectionSummary> = {};

  for (const e of weekEntries) {
    const cat = categories.find((c) => c.id === e.categoryId);
    const section = cat?.section || 'Other';
    const weights = getSectionWeights(section);
    const pts = e.status === 'SMILEY' ? weights.smiley : weights.sad;

    totalPoints += pts;
    totalPossiblePoints += weights.possible;

    if (!sectionMap[section]) {
      sectionMap[section] = { section, points: 0, possiblePoints: 0, smileyCount: 0, sadCount: 0 };
    }
    sectionMap[section].points += pts;
    sectionMap[section].possiblePoints += weights.possible;
    if (e.status === 'SMILEY') sectionMap[section].smileyCount++;
    else sectionMap[section].sadCount++;
  }

  const REWARD_THRESHOLD = 0.8;
  const rewardEarned = totalPossiblePoints > 0 && totalPoints / totalPossiblePoints >= REWARD_THRESHOLD;
  const rewardPercent = totalPossiblePoints > 0 ? Math.round((totalPoints / totalPossiblePoints) * 100) : 0;

  const smileyCount = weekEntries.filter((e) => e.status === 'SMILEY').length;
  const sadCount = weekEntries.filter((e) => e.status === 'SAD').length;

  const SECTION_ORDER = [
    'Morning Routine (7–9 a.m.)',
    'Daycare Report',
    'Sibling Interactions',
    'Afternoon Routine (3–6 p.m.)',
    'Evening Routine (6–8 p.m.)',
  ];

  const sectionBreakdown = Object.values(sectionMap).sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a.section);
    const bi = SECTION_ORDER.indexOf(b.section);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return {
    totalPoints,
    totalPossiblePoints,
    rewardEarned,
    rewardPercent,
    smileyCount,
    sadCount,
    totalEntries: weekEntries.length,
    sectionBreakdown,
    entries: weekEntries,
  };
}

export async function getUser(): Promise<User | null> {
  const data = await AsyncStorage.getItem(USER_KEY);
  return data ? JSON.parse(data) : null;
}

export async function saveUser(user: User): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

export async function clearUser(): Promise<void> {
  await AsyncStorage.removeItem(USER_KEY);
}

export async function clearAllData(): Promise<void> {
  await AsyncStorage.removeItem(USER_KEY);
}

export async function addAuditLog(): Promise<void> {}
