import { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Platform, RefreshControl, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { type Child } from '@/lib/storage';
import Colors from '@/constants/colors';
import ChildHeroBg from '@/components/ChildHeroBg';

const ISAAC_IMG = require('@/assets/images/isaac-avatar.png');
const ISAIAH_IMG = require('@/assets/images/isaiah-avatar.png');

const CHILD_COLORS = ['#1B9FE5', '#A78BFA', '#FF9A3C', '#FF85A1', '#4DC97A'];

interface ChildSummary {
  childId: string;
  totalPoints: number;
  smileyCount: number;
  sadCount: number;
  todayEntries: number;
}

function getChildImage(child: Child) {
  if (child.photo) return { uri: child.photo };
  if (child.firstName === 'Isaac') return ISAAC_IMG;
  if (child.firstName === 'Isaiah') return ISAIAH_IMG;
  return null;
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { children, entries, isLoading, refreshData, getChildWeeklySummary } = useData();
  const isViewer = user?.role === 'VIEWER';
  const [refreshing, setRefreshing] = useState(false);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  const today = new Date().toDateString();
  const summaries: Record<string, ChildSummary> = {};
  for (const child of children) {
    const summary = getChildWeeklySummary(child.id);
    const todayEntries = entries.filter(
      (e) => e.childId === child.id && new Date(e.recordedAt).toDateString() === today,
    ).length;
    summaries[child.id] = {
      childId: child.id,
      totalPoints: summary.totalPoints,
      smileyCount: summary.smileyCount,
      sadCount: summary.sadCount,
      todayEntries,
    };
  }

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const totalWeeklyPoints = Object.values(summaries).reduce((s, v) => s + v.totalPoints, 0);
  const totalTodayEntries = Object.values(summaries).reduce((s, v) => s + v.todayEntries, 0);

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FlatList
        data={children}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.childRow}
        contentContainerStyle={{
          paddingBottom: insets.bottom + webBottomInset + 100,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          <View>
            <ChildHeroBg style={[styles.hero, { paddingTop: insets.top + webTopInset }]}>
              <View style={styles.heroContent}>
                <Text style={styles.heroGreeting}>{getGreeting()},</Text>
                <Text style={styles.heroName}>{user?.name || 'Parent'} 👋</Text>
                <View style={styles.heroStats}>
                  <View style={styles.heroStatBubble}>
                    <Text style={styles.heroStatEmoji}>⭐</Text>
                    <Text style={styles.heroStatValue}>{totalWeeklyPoints}</Text>
                    <Text style={styles.heroStatLabel}>This week</Text>
                  </View>
                  <View style={styles.heroStatBubble}>
                    <Text style={styles.heroStatEmoji}>📅</Text>
                    <Text style={styles.heroStatValue}>{totalTodayEntries}</Text>
                    <Text style={styles.heroStatLabel}>Today</Text>
                  </View>
                </View>
              </View>
            </ChildHeroBg>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>⭐ My Stars</Text>
                <Text style={styles.sectionSubtitle}>Tap a card to see their dashboard</Text>
              </View>
              {!isViewer && (
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push('/add-child');
                  }}
                  style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="add" size={22} color={Colors.primary} />
                </Pressable>
              )}
            </View>
          </View>
        }
        renderItem={({ item, index }) => {
          const summary = summaries[item.id];
          const img = getChildImage(item);
          const cardColor = CHILD_COLORS[index % CHILD_COLORS.length];
          const rewardEarned = getChildWeeklySummary(item.id).rewardEarned;
          return (
            <Pressable
              style={({ pressed }) => [
                styles.childCard,
                pressed && { opacity: 0.92, transform: [{ scale: 0.97 }] },
              ]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({ pathname: '/child/[id]', params: { id: item.id } });
              }}
            >
              <View style={[styles.childPhotoContainer, { backgroundColor: cardColor + '25' }]}>
                {img ? (
                  <Image source={img} style={styles.childPhoto} resizeMode="cover" />
                ) : (
                  <View style={[styles.childPhotoPlaceholder, { backgroundColor: cardColor }]}>
                    <Text style={styles.childInitials}>
                      {item.firstName[0]}{item.lastName[0]}
                    </Text>
                  </View>
                )}
                {rewardEarned && (
                  <View style={styles.rewardBadge}>
                    <Text style={styles.rewardBadgeText}>🏆</Text>
                  </View>
                )}
                {summary && summary.totalPoints > 0 && (
                  <View style={[styles.pointsBadge, { backgroundColor: cardColor }]}>
                    <Text style={styles.pointsBadgeText}>⭐ {summary.totalPoints}</Text>
                  </View>
                )}
              </View>

              <View style={styles.childCardBody}>
                <Text style={[styles.childFirstName, { color: cardColor }]}>{item.firstName}</Text>
                <Text style={styles.childLastName}>{item.lastName}</Text>

                <View style={styles.childMiniStats}>
                  <View style={[styles.miniFace, { backgroundColor: Colors.smileyBg }]}>
                    <Text style={styles.miniFaceEmoji}>😄</Text>
                    <Text style={[styles.miniStatText, { color: Colors.smiley }]}>{summary?.smileyCount ?? 0}</Text>
                  </View>
                  <View style={[styles.miniFace, { backgroundColor: Colors.sadBg }]}>
                    <Text style={styles.miniFaceEmoji}>😢</Text>
                    <Text style={[styles.miniStatText, { color: Colors.sad }]}>{summary?.sadCount ?? 0}</Text>
                  </View>
                </View>
              </View>

              <View style={[styles.childCardTap, { backgroundColor: cardColor + '15' }]}>
                <Ionicons name="chevron-forward" size={14} color={cardColor} />
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>⭐</Text>
              <Text style={styles.emptyTitle}>No stars yet!</Text>
              <Text style={styles.emptySubtitle}>
                Tap the + button above to add your first superstar!
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    minHeight: 300,
    justifyContent: 'flex-end',
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 16,
  },
  heroGreeting: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#0A4872',
    letterSpacing: 0.3,
  },
  heroName: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: '#0A3050',
    marginBottom: 16,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 10,
  },
  heroStatBubble: {
    backgroundColor: 'rgba(255,255,255,0.65)',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  heroStatEmoji: {
    fontSize: 18,
  },
  heroStatValue: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: '#0A3050',
  },
  heroStatLabel: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: '#0A4872',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    marginTop: 2,
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary + '20',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary + '40',
  },
  childRow: {
    paddingHorizontal: 20,
    gap: 14,
    marginBottom: 14,
  },
  childCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    elevation: 4,
    shadowColor: '#1B9FE5',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  childPhotoContainer: {
    position: 'relative',
    height: 160,
  },
  childPhoto: {
    width: '100%',
    height: '100%',
  },
  childPhotoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childInitials: {
    fontSize: 36,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  rewardBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  rewardBadgeText: {
    fontSize: 16,
  },
  pointsBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pointsBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  childCardBody: {
    padding: 12,
    paddingBottom: 10,
  },
  childFirstName: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  childLastName: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginBottom: 10,
  },
  childMiniStats: {
    flexDirection: 'row',
    gap: 6,
  },
  miniFace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
  },
  miniFaceEmoji: {
    fontSize: 12,
  },
  miniStatText: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  childCardTap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 22,
  },
});
