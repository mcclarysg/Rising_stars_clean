import { View, Text, FlatList, StyleSheet, Platform, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, isToday, isYesterday } from 'date-fns';
import { useData } from '@/contexts/DataContext';
import Colors from '@/constants/colors';
import { useState, useMemo } from 'react';

function getWeekStart(): Date {
  const now = new Date();
  const d = new Date(now);
  const daysSinceSat = (d.getDay() + 1) % 7;
  d.setDate(d.getDate() - daysSinceSat);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { entries, children, categories, refreshData } = useData();
  const [refreshing, setRefreshing] = useState(false);

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const sortedEntries = useMemo(() => {
    const weekStart = getWeekStart();
    return [...entries]
      .filter((e) => new Date(e.recordedAt) >= weekStart)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }, [entries]);

  const getChildName = (childId: string) => {
    const child = children.find((c) => c.id === childId);
    return child ? child.firstName : 'Unknown';
  };

  const getCategoryName = (categoryId: string) => {
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.name || 'Unknown';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return `Today, ${format(date, 'h:mm a')}`;
    if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`;
    return format(date, 'MMM d, h:mm a');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FlatList
        data={sortedEntries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: insets.top + webTopInset + 16,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.headerSection}>
            <Text style={styles.pageTitle}>📋 Activity</Text>
            <Text style={styles.pageSubtitle}>This week's behavior entries</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSmiley = item.status === 'SMILEY';
          return (
            <View style={[styles.entryCard, { borderLeftColor: isSmiley ? Colors.smiley : Colors.sad }]}>
              <View style={[styles.faceCircle, { backgroundColor: isSmiley ? Colors.smileyBg : Colors.sadBg }]}>
                <Text style={styles.faceEmoji}>{isSmiley ? '😄' : '😢'}</Text>
              </View>
              <View style={styles.entryInfo}>
                <View style={styles.entryTop}>
                  <Text style={styles.entryChild}>{getChildName(item.childId)}</Text>
                  <View style={[styles.pointPill, { backgroundColor: isSmiley ? Colors.smileyBg : Colors.surfaceSecondary }]}>
                    <Text style={[styles.pointPillText, { color: isSmiley ? Colors.smiley : Colors.textTertiary }]}>
                      +{item.pointsAwarded} pt{item.pointsAwarded !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>
                <Text style={styles.entryCategory}>{getCategoryName(item.categoryId)}</Text>
                <Text style={styles.entryTime}>{formatDate(item.recordedAt)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📝</Text>
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptySubtitle}>
              Behavior entries will show up here once you start tracking!
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerSection: {
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  pageTitle: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  pageSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 4,
  },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  faceCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  faceEmoji: {
    fontSize: 26,
  },
  entryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  entryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  entryChild: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.primary,
  },
  pointPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  pointPillText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  entryCategory: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.text,
    marginBottom: 2,
  },
  entryTime: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 52,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 260,
    lineHeight: 22,
  },
});
