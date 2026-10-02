import { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withDelay } from 'react-native-reanimated';
import { format } from 'date-fns';
import { useData } from '@/contexts/DataContext';
import { type SectionSummary } from '@/lib/storage';
import { apiRequest } from '@/lib/query-client';
import Colors from '@/constants/colors';

const SECTION_WEIGHTS: Record<string, string> = {
  'Morning Routine (7–9 a.m.)': '1 pt each',
  'Afternoon Routine (3–6 p.m.)': '1 pt each',
  'Evening Routine (6–8 p.m.)': '1 pt each',
  'Sibling Interactions': '±2 pts each',
  'Daycare Report': '±3 pts each',
};

const SECTION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  'Morning Routine (7–9 a.m.)': 'sunny',
  'Afternoon Routine (3–6 p.m.)': 'partly-sunny',
  'Evening Routine (6–8 p.m.)': 'moon',
  'Sibling Interactions': 'people',
  'Daycare Report': 'school',
};

export default function WeeklySummaryScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { children, getChildWeeklySummary } = useData();

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  const child = children.find((c) => c.id === id);
  const summary = id ? getChildWeeklySummary(id) : {
    totalPoints: 0, totalPossiblePoints: 0, rewardEarned: false, rewardPercent: 0,
    smileyCount: 0, sadCount: 0, totalEntries: 0,
    sectionBreakdown: [] as SectionSummary[], entries: [] as any[],
  };

  const [aiText, setAiText] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);

  const progressAnim = useSharedValue(0);

  useEffect(() => {
    progressAnim.value = withDelay(300, withTiming(1, { duration: 900 }));
  }, [summary.rewardPercent]);

  const fetchAiInsights = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError(false);
    setAiText('');
    try {
      const daysIntoWeek = (new Date().getDay() + 1) % 7 + 1;
      const res = await apiRequest('POST', '/api/ai-recommendations', {
        childName: child?.firstName || 'this child',
        totalPoints: summary.totalPoints,
        totalPossiblePoints: summary.totalPossiblePoints,
        rewardPercent: summary.rewardPercent,
        rewardEarned: summary.rewardEarned,
        sectionBreakdown: summary.sectionBreakdown,
        daysIntoWeek,
      });
      const data = await res.json();
      setAiText(data.recommendations || '');
    } catch {
      setAiError(true);
    } finally {
      setAiLoading(false);
    }
  };

  const clampedPercent = Math.max(0, Math.min(summary.rewardPercent / 100, 1));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${clampedPercent * 100 * progressAnim.value}%` as any,
  }));

  const thresholdStyle = useAnimatedStyle(() => ({
    left: `${80 * progressAnim.value}%` as any,
  }));

  const now = new Date();
  const daysSinceSat = (now.getDay() + 1) % 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - daysSinceSat);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const getSectionColor = (sec: SectionSummary) => {
    if (sec.possiblePoints === 0) return Colors.textTertiary;
    const pct = sec.points / sec.possiblePoints;
    if (pct >= 0.8) return Colors.smiley;
    if (pct >= 0.5) return Colors.warning;
    return Colors.sad;
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: Colors.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + webTopInset + 8,
        paddingBottom: insets.bottom + webBottomInset + 40,
        paddingHorizontal: 20,
      }}
    >
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Weekly Summary</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.heroName}>{child?.firstName}'s Week</Text>
        <Text style={styles.heroDateRange}>
          {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
        </Text>

        <View style={styles.heroPoints}>
          <Text style={styles.heroPointsValue}>{summary.totalPoints}</Text>
          <Text style={styles.heroPointsLabel}>
            of {summary.totalPossiblePoints} possible points
          </Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                { backgroundColor: summary.rewardEarned ? '#4ade80' : 'rgba(255,255,255,0.9)' },
                progressStyle,
              ]}
            />
            <Animated.View style={[styles.thresholdMarker, thresholdStyle]}>
              <View style={styles.thresholdLine} />
              <Text style={styles.thresholdLabel}>80%</Text>
            </Animated.View>
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.progressNote}>0 pts</Text>
            <Text style={styles.progressNote}>{summary.rewardPercent}% earned</Text>
            <Text style={styles.progressNote}>{summary.totalPossiblePoints} pts</Text>
          </View>
        </View>
      </View>

      <View style={[styles.rewardBanner, summary.rewardEarned ? styles.rewardBannerEarned : styles.rewardBannerMissed]}>
        <Ionicons
          name={summary.rewardEarned ? 'trophy' : 'trophy-outline'}
          size={28}
          color={summary.rewardEarned ? '#f59e0b' : Colors.textTertiary}
        />
        <View style={styles.rewardBannerText}>
          <Text style={[styles.rewardBannerTitle, summary.rewardEarned && { color: '#92400e' }]}>
            {summary.rewardEarned ? 'Weekly Reward Earned!' : 'Weekly Reward Not Earned'}
          </Text>
          <Text style={[styles.rewardBannerSub, summary.rewardEarned && { color: '#b45309' }]}>
            {summary.rewardEarned
              ? `${child?.firstName} hit 80% — great week!`
              : `Need ${80 - summary.rewardPercent > 0 ? 80 - summary.rewardPercent : 0}% more to reach the 80% goal`}
          </Text>
        </View>
      </View>

      <View style={styles.overviewRow}>
        <View style={styles.overviewCard}>
          <Ionicons name="happy" size={20} color={Colors.smiley} />
          <Text style={styles.overviewValue}>{summary.smileyCount}</Text>
          <Text style={styles.overviewLabel}>Smiley</Text>
        </View>
        <View style={styles.overviewCard}>
          <Ionicons name="sad" size={20} color={Colors.sad} />
          <Text style={styles.overviewValue}>{summary.sadCount}</Text>
          <Text style={styles.overviewLabel}>Sad</Text>
        </View>
        <View style={styles.overviewCard}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />
          <Text style={styles.overviewValue}>{summary.totalEntries}</Text>
          <Text style={styles.overviewLabel}>Logged</Text>
        </View>
        <View style={styles.overviewCard}>
          <Ionicons name="trending-up" size={20} color={Colors.warning} />
          <Text style={styles.overviewValue}>
            {summary.totalEntries > 0 ? Math.round((summary.smileyCount / summary.totalEntries) * 100) : 0}%
          </Text>
          <Text style={styles.overviewLabel}>Positive</Text>
        </View>
      </View>

      {summary.sectionBreakdown.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Section Breakdown</Text>
          {summary.sectionBreakdown.map((sec) => {
            const pct = sec.possiblePoints > 0 ? sec.points / sec.possiblePoints : 0;
            const color = getSectionColor(sec);
            const weight = SECTION_WEIGHTS[sec.section] || '';
            const icon = SECTION_ICONS[sec.section] || 'star';
            return (
              <View key={sec.section} style={styles.secCard}>
                <View style={styles.secHeader}>
                  <View style={[styles.secIconWrap, { backgroundColor: color + '20' }]}>
                    <Ionicons name={icon} size={16} color={color} />
                  </View>
                  <View style={styles.secHeaderText}>
                    <Text style={styles.secName}>{sec.section}</Text>
                    <Text style={styles.secWeight}>{weight}</Text>
                  </View>
                  <View style={styles.secPoints}>
                    <Text style={[styles.secPointsValue, { color }]}>{sec.points > 0 ? '+' : ''}{sec.points}</Text>
                    <Text style={styles.secPointsPossible}>/ {sec.possiblePoints}</Text>
                  </View>
                </View>
                <View style={styles.secProgress}>
                  <View style={styles.secTrack}>
                    <View style={[styles.secFill, { width: `${Math.max(0, Math.min(pct, 1)) * 100}%`, backgroundColor: color }]} />
                  </View>
                  <View style={styles.secStats}>
                    <View style={styles.secStat}>
                      <Ionicons name="happy" size={12} color={Colors.smiley} />
                      <Text style={styles.secStatText}>{sec.smileyCount}</Text>
                    </View>
                    <View style={styles.secStat}>
                      <Ionicons name="sad" size={12} color={Colors.sad} />
                      <Text style={styles.secStatText}>{sec.sadCount}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.aiCard}>
        <View style={styles.aiHeader}>
          <Ionicons name="sparkles" size={18} color="#7C3AED" />
          <Text style={styles.aiTitle}>AI Behavior Insights</Text>
        </View>
        {!aiText && !aiLoading && (
          <>
            <Text style={styles.aiDescription}>
              Get personalized recommendations and tips to help reach the 80% reward goal.
            </Text>
            <Pressable style={styles.aiButton} onPress={fetchAiInsights}>
              <Ionicons name="bulb-outline" size={16} color="#fff" />
              <Text style={styles.aiButtonText}>Get Insights</Text>
            </Pressable>
            {aiError && (
              <Text style={styles.aiError}>Something went wrong. Please try again.</Text>
            )}
          </>
        )}
        {aiLoading && (
          <View style={styles.aiLoading}>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text style={styles.aiLoadingText}>Analyzing behavior data…</Text>
          </View>
        )}
        {aiText && !aiLoading && (
          <>
            <Text style={styles.aiContent}>{aiText}</Text>
            <Pressable style={styles.aiRefreshBtn} onPress={fetchAiInsights}>
              <Ionicons name="refresh-outline" size={14} color="#7C3AED" />
              <Text style={styles.aiRefreshText}>Refresh</Text>
            </Pressable>
          </>
        )}
      </View>

      {summary.totalEntries === 0 && (
        <View style={styles.emptyState}>
          <Ionicons name="calendar-outline" size={40} color={Colors.textTertiary} />
          <Text style={styles.emptyTitle}>No entries this week</Text>
          <Text style={styles.emptySubtitle}>Log behaviors on the child screen to see the weekly summary</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 17,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  heroCard: {
    backgroundColor: Colors.primary,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  heroName: {
    fontSize: 18,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textInverse,
    opacity: 0.9,
  },
  heroDateRange: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textInverse,
    opacity: 0.7,
    marginTop: 2,
  },
  heroPoints: {
    alignItems: 'center',
    marginVertical: 20,
  },
  heroPointsValue: {
    fontSize: 52,
    fontFamily: 'Inter_700Bold',
    color: Colors.textInverse,
    lineHeight: 60,
  },
  heroPointsLabel: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textInverse,
    opacity: 0.75,
    marginTop: 4,
  },
  progressContainer: { gap: 8 },
  progressTrack: {
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 5,
    overflow: 'visible',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  thresholdMarker: {
    position: 'absolute',
    top: -4,
    alignItems: 'center',
  },
  thresholdLine: {
    width: 2,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 1,
  },
  thresholdLabel: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  progressNote: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: 'rgba(255,255,255,0.65)',
  },
  rewardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  rewardBannerEarned: {
    backgroundColor: '#fefce8',
    borderColor: '#fde68a',
  },
  rewardBannerMissed: {
    backgroundColor: Colors.surface,
    borderColor: Colors.borderLight,
  },
  rewardBannerText: { flex: 1 },
  rewardBannerTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  rewardBannerSub: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  overviewRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  overviewCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  overviewValue: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  overviewLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    marginBottom: 12,
  },
  secCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 10,
  },
  secHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secHeaderText: { flex: 1 },
  secName: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  secWeight: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    marginTop: 1,
  },
  secPoints: {
    alignItems: 'flex-end',
  },
  secPointsValue: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  secPointsPossible: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
  },
  secProgress: {
    gap: 6,
  },
  secTrack: {
    height: 6,
    backgroundColor: Colors.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  secFill: {
    height: '100%',
    borderRadius: 3,
  },
  secStats: {
    flexDirection: 'row',
    gap: 12,
  },
  secStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  secStatText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  aiCard: {
    backgroundColor: '#F5F3FF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  aiTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#5B21B6',
  },
  aiDescription: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#6D28D9',
    marginBottom: 14,
    lineHeight: 19,
  },
  aiButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 11,
  },
  aiButtonText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
  aiError: {
    marginTop: 10,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.sad,
    textAlign: 'center',
  },
  aiLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  aiLoadingText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#7C3AED',
  },
  aiContent: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#1E1B4B',
    lineHeight: 20,
  },
  aiRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 14,
    alignSelf: 'flex-start',
  },
  aiRefreshText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#7C3AED',
  },
});
