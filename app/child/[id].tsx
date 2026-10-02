import { useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Platform, Alert, Image, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { format, isToday, isYesterday } from 'date-fns';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { type BehaviorStatus } from '@/lib/storage';
import { apiRequest, getApiUrl } from '@/lib/query-client';
import Colors from '@/constants/colors';

const ISAAC_IMG = require('@/assets/images/isaac-avatar.png');
const ISAIAH_IMG = require('@/assets/images/isaiah-avatar.png');
const ISAAC_HAPPY = require('@/assets/images/isaac-happy.png');
const ISAAC_SAD = require('@/assets/images/isaac-sad.png');
const ISAIAH_HAPPY = require('@/assets/images/isaiah-happy.png');
const ISAIAH_SAD = require('@/assets/images/isaiah-sad.png');

const SECTION_COLORS: Record<string, string> = {
  'Morning Routine (7–9 a.m.)': '#FFD93D',
  'Daycare Report': '#4DC97A',
  'Sibling Interactions': '#A78BFA',
  'Afternoon Routine (3–6 p.m.)': '#FF9A3C',
  'Evening Routine (6–8 p.m.)': '#1B9FE5',
};
const SECTION_EMOJIS: Record<string, string> = {
  'Morning Routine (7–9 a.m.)': '☀️',
  'Daycare Report': '🏫',
  'Sibling Interactions': '🤝',
  'Afternoon Routine (3–6 p.m.)': '🌤️',
  'Evening Routine (6–8 p.m.)': '🌙',
};

export default function ChildDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { children, categories, entries, documents, removeCategory, updateChildPhoto, addDoc, removeDoc, addBehaviorEntry, removeBehaviorEntry, getChildWeeklySummary } = useData();
  const isViewer = user?.role === 'VIEWER';

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const child = children.find((c) => c.id === id);
  const childCategories = categories.filter((c) => c.childId === id);
  const childEntries = [...entries.filter((e) => e.childId === id)].sort(
    (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
  );
  const childDocuments = [...documents.filter((d) => d.childId === id)].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const weekSummary = id ? getChildWeeklySummary(id) : { totalPoints: 0, smileyCount: 0, sadCount: 0, totalPossiblePoints: 0, rewardEarned: false, rewardPercent: 0, totalEntries: 0, sectionBreakdown: [], entries: [] };

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

  const handleChangePhoto = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0] && id) {
      await updateChildPhoto(id, result.assets[0].uri);
    }
  };

  const getChildImage = () => {
    if (!child) return null;
    if (child.photo) return { uri: child.photo };
    if (child.firstName === 'Isaac') return ISAAC_IMG;
    if (child.firstName === 'Isaiah') return ISAIAH_IMG;
    return null;
  };

  const handleUploadDoc = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0] && id) {
      const asset = result.assets[0];
      await addDoc(id, asset.uri, asset.fileName || `doc_${Date.now()}.jpg`, asset.mimeType || 'image/jpeg');
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleDeleteDoc = (docId: string) => {
    Alert.alert('Delete Document', 'Remove this document?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeDoc(docId) },
    ]);
  };

  const handleDeleteCategory = (catId: string, catName: string) => {
    Alert.alert('Remove Category', `Remove "${catName}" from tracking?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeCategory(catId) },
    ]);
  };

  const getHappyImg = () => {
    if (!child) return ISAAC_HAPPY;
    return child.firstName === 'Isaiah' ? ISAIAH_HAPPY : ISAAC_HAPPY;
  };

  const getSadImg = () => {
    if (!child) return ISAAC_SAD;
    return child.firstName === 'Isaiah' ? ISAIAH_SAD : ISAAC_SAD;
  };

  const getTodayEntry = (categoryId: string) => {
    const today = new Date().toDateString();
    return childEntries.find(
      (e) => e.categoryId === categoryId && new Date(e.recordedAt).toDateString() === today,
    );
  };

  const [loggingId, setLoggingId] = useState<string | null>(null);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);

  const fetchAiInsights = async () => {
    if (aiLoading) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setAiLoading(true);
    setAiError(false);
    setAiText('');
    try {
      const daysIntoWeek = (new Date().getDay() + 1) % 7 + 1;
      const res = await apiRequest('POST', '/api/ai-recommendations', {
        childName: child?.firstName || 'this child',
        totalPoints: weekSummary.totalPoints,
        totalPossiblePoints: weekSummary.totalPossiblePoints,
        rewardPercent: weekSummary.rewardPercent,
        rewardEarned: weekSummary.rewardEarned,
        sectionBreakdown: weekSummary.sectionBreakdown,
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

  const handleLogRoutine = async (categoryId: string, status: BehaviorStatus) => {
    if (loggingId) return;
    setLoggingId(categoryId + status);
    const todayEntry = getTodayEntry(categoryId);
    try {
      if (todayEntry?.status === status) {
        await removeBehaviorEntry(todayEntry.id);
      } else {
        if (todayEntry) await removeBehaviorEntry(todayEntry.id);
        if (Platform.OS !== 'web') {
          status === 'SMILEY'
            ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
        await addBehaviorEntry(id!, categoryId, status);
      }
    } finally {
      setLoggingId(null);
    }
  };

  if (!child) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + webTopInset }]}>
        <Text style={styles.errorText}>Child not found</Text>
      </View>
    );
  }

  const age = Math.floor(
    (Date.now() - new Date(child.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000),
  );

  const childColor = child.firstName === 'Isaiah' ? Colors.purple : Colors.primary;

  const SECTION_ORDER = [
    'Morning Routine (7–9 a.m.)',
    'Daycare Report',
    'Sibling Interactions',
    'Afternoon Routine (3–6 p.m.)',
    'Evening Routine (6–8 p.m.)',
  ];
  const SECTION_POINTS: Record<string, string> = {
    'Morning Routine (7–9 a.m.)': '+1 pt',
    'Afternoon Routine (3–6 p.m.)': '+1 pt',
    'Evening Routine (6–8 p.m.)': '+1 pt',
    'Sibling Interactions': '±2 pts',
    'Daycare Report': '±3 pts',
  };

  const todayDayOfWeek = new Date().getDay();
  const isWeekend = todayDayOfWeek === 0 || todayDayOfWeek === 6;

  const grouped: { section: string; items: typeof childCategories }[] = [];
  childCategories.forEach((cat) => {
    const sec = cat.section || 'Other';
    if (isWeekend && sec === 'Daycare Report') return;
    const existing = grouped.find((g) => g.section === sec);
    if (existing) existing.items.push(cat);
    else grouped.push({ section: sec, items: [cat] });
  });
  grouped.sort((a, b) => {
    const ai = SECTION_ORDER.indexOf(a.section);
    const bi = SECTION_ORDER.indexOf(b.section);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <FlatList
        data={childEntries.slice(0, 20)}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingTop: insets.top + webTopInset + 8,
          paddingBottom: insets.bottom + 40,
          paddingHorizontal: 16,
        }}
        ListHeaderComponent={
          <View>
            <View style={styles.topBar}>
              <Pressable onPress={() => router.back()} style={styles.backBtn}>
                <Ionicons name="chevron-back" size={24} color={Colors.text} />
              </Pressable>
              <Pressable
                onPress={() => {
                  if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push({ pathname: '/weekly-summary/[id]', params: { id: id! } });
                }}
                style={[styles.summaryBtn, { backgroundColor: childColor + '18' }]}
              >
                <Ionicons name="bar-chart" size={18} color={childColor} />
              </Pressable>
            </View>

            <View style={styles.profileSection}>
              <Pressable onPress={isViewer ? undefined : handleChangePhoto} style={styles.avatarContainer}>
                <View style={[styles.avatarRing, { borderColor: childColor }]}>
                  {getChildImage() ? (
                    <Image source={getChildImage()!} style={styles.avatarImage} resizeMode="cover" />
                  ) : (
                    <View style={[styles.avatarPlaceholder, { backgroundColor: childColor }]}>
                      <Text style={styles.avatarText}>{child.firstName[0]}{child.lastName[0]}</Text>
                    </View>
                  )}
                </View>
                {!isViewer && (
                  <View style={[styles.cameraBtn, { backgroundColor: childColor }]}>
                    <Ionicons name="camera" size={13} color="#fff" />
                  </View>
                )}
              </Pressable>
              <Text style={[styles.childName, { color: childColor }]}>{child.firstName} {child.lastName}</Text>
              <Text style={styles.childAge}>⭐ {age} year{age !== 1 ? 's' : ''} old</Text>
            </View>

            <View style={[styles.weekCard, { borderColor: childColor + '30' }]}>
              <View style={styles.weekCardHeader}>
                <Text style={styles.weekCardTitle}>This Week</Text>
                {weekSummary.rewardEarned && (
                  <View style={styles.rewardEarnedBadge}>
                    <Text style={styles.rewardEarnedText}>🏆 Reward earned!</Text>
                  </View>
                )}
              </View>
              <View style={styles.weekStats}>
                <View style={[styles.weekStatBox, { backgroundColor: Colors.primary + '15' }]}>
                  <Text style={styles.weekStatEmoji}>⭐</Text>
                  <Text style={[styles.weekStatValue, { color: Colors.primary }]}>{weekSummary.totalPoints}</Text>
                  <Text style={styles.weekStatLabel}>Points</Text>
                </View>
                <View style={[styles.weekStatBox, { backgroundColor: Colors.smileyBg }]}>
                  <Text style={styles.weekStatEmoji}>😄</Text>
                  <Text style={[styles.weekStatValue, { color: Colors.smiley }]}>{weekSummary.smileyCount}</Text>
                  <Text style={styles.weekStatLabel}>Happy</Text>
                </View>
                <View style={[styles.weekStatBox, { backgroundColor: Colors.sadBg }]}>
                  <Text style={styles.weekStatEmoji}>😢</Text>
                  <Text style={[styles.weekStatValue, { color: Colors.sad }]}>{weekSummary.sadCount}</Text>
                  <Text style={styles.weekStatLabel}>Sad</Text>
                </View>
              </View>
              {weekSummary.rewardPercent !== undefined && (
                <View style={styles.progressBarWrap}>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${Math.min(weekSummary.rewardPercent, 100)}%` as any, backgroundColor: childColor }]} />
                  </View>
                  <Text style={styles.progressLabel}>{Math.round(weekSummary.rewardPercent ?? 0)}% toward reward</Text>
                </View>
              )}
            </View>

            {!isViewer && (
              <View style={styles.aiInsightCard}>
                <View style={styles.aiInsightHeader}>
                  <View style={styles.aiInsightBadge}>
                    <Text style={styles.aiInsightBadgeText}>✨ AI</Text>
                  </View>
                  <Text style={styles.aiInsightTitle}>Behavior Insights</Text>
                  {aiText ? (
                    <Pressable onPress={fetchAiInsights} style={styles.aiRefreshBtn}>
                      <Ionicons name="refresh-outline" size={15} color="#7C3AED" />
                    </Pressable>
                  ) : null}
                </View>

                {!aiText && !aiLoading && (
                  <>
                    <Text style={styles.aiInsightDesc}>
                      Get personalized tips to help {child.firstName} reach the 80% reward goal this week.
                    </Text>
                    <Pressable
                      style={({ pressed }) => [styles.aiInsightBtn, pressed && { opacity: 0.85 }]}
                      onPress={fetchAiInsights}
                    >
                      <Ionicons name="sparkles" size={16} color="#fff" />
                      <Text style={styles.aiInsightBtnText}>Get Insights</Text>
                    </Pressable>
                    {aiError && (
                      <Text style={styles.aiInsightError}>Something went wrong — please try again.</Text>
                    )}
                  </>
                )}

                {aiLoading && (
                  <View style={styles.aiInsightLoading}>
                    <ActivityIndicator size="small" color="#7C3AED" />
                    <Text style={styles.aiInsightLoadingText}>Analyzing {child.firstName}'s week…</Text>
                  </View>
                )}

                {aiText && !aiLoading && (
                  <Text style={styles.aiInsightContent}>{aiText}</Text>
                )}
              </View>
            )}

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>📅 Daily Routine</Text>
              {!isViewer && (
                <Pressable
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    router.push({ pathname: '/add-category', params: { childId: id! } });
                  }}
                  style={({ pressed }) => [styles.addSmall, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="add" size={18} color={Colors.primary} />
                </Pressable>
              )}
            </View>

            {childCategories.length === 0 ? (
              <View style={styles.emptySmall}>
                <Text style={styles.emptySmallText}>No routine items yet. Tap + to add one.</Text>
              </View>
            ) : (
              <View style={styles.routineList}>
                {grouped.map((group, gIdx) => {
                  const secColor = SECTION_COLORS[group.section] || Colors.primary;
                  const secEmoji = SECTION_EMOJIS[group.section] || '📌';
                  return (
                    <View key={group.section} style={styles.routineGroup}>
                      <View style={[styles.routineGroupHeader, { backgroundColor: secColor + '22', borderLeftColor: secColor }]}>
                        <Text style={styles.routineGroupEmoji}>{secEmoji}</Text>
                        <Text style={[styles.routineGroupTitle, { color: secColor === Colors.yellow ? '#B07A00' : secColor }]}>{group.section}</Text>
                        {SECTION_POINTS[group.section] && (
                          <View style={[styles.sectionPointsBadge, { backgroundColor: secColor + '30' }]}>
                            <Text style={[styles.sectionPointsText, { color: secColor === Colors.yellow ? '#B07A00' : secColor }]}>{SECTION_POINTS[group.section]}</Text>
                          </View>
                        )}
                      </View>
                      {group.items.map((cat, idx) => {
                        const todayEntry = getTodayEntry(cat.id);
                        const isLogging = loggingId === cat.id + 'SMILEY' || loggingId === cat.id + 'SAD';
                        const isHappy = todayEntry?.status === 'SMILEY';
                        const isSad = todayEntry?.status === 'SAD';
                        return (
                          <View
                            key={cat.id}
                            style={[styles.routineItem, idx === group.items.length - 1 && { borderBottomWidth: 0 }, todayEntry && { backgroundColor: isHappy ? Colors.smileyBg : Colors.sadBg }]}
                          >
                            <Pressable
                              onLongPress={isViewer ? undefined : () => handleDeleteCategory(cat.id, cat.name)}
                              style={styles.routineItemName}
                            >
                              <Text style={styles.routineItemText} numberOfLines={2}>{cat.name}</Text>
                            </Pressable>
                            <View style={styles.faceButtons}>
                              <Pressable
                                onPress={() => handleLogRoutine(cat.id, 'SMILEY')}
                                disabled={isLogging || isViewer}
                                style={[
                                  styles.faceBtn,
                                  isHappy && styles.faceBtnActiveHappy,
                                  isViewer && { opacity: 0.4 },
                                ]}
                              >
                                <Image source={getHappyImg()} style={styles.facePhoto} resizeMode="cover" />
                              </Pressable>
                              <Pressable
                                onPress={() => handleLogRoutine(cat.id, 'SAD')}
                                disabled={isLogging || isViewer}
                                style={[
                                  styles.faceBtn,
                                  isSad && styles.faceBtnActiveSad,
                                  isViewer && { opacity: 0.4 },
                                ]}
                              >
                                <Image source={getSadImg()} style={styles.facePhoto} resizeMode="cover" />
                              </Pressable>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>📄 Documents</Text>
              {!isViewer && (
                <Pressable
                  onPress={handleUploadDoc}
                  style={({ pressed }) => [styles.addSmall, pressed && { opacity: 0.7 }]}
                >
                  <Ionicons name="cloud-upload" size={16} color={Colors.primary} />
                </Pressable>
              )}
            </View>

            {childDocuments.length === 0 ? (
              <View style={styles.emptySmall}>
                <Text style={styles.emptySmallText}>No documents yet. Tap ↑ to upload one.</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.docsScroll} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
                {childDocuments.map((doc) => (
                  <Pressable
                    key={doc.id}
                    onLongPress={isViewer ? undefined : () => handleDeleteDoc(doc.id)}
                    style={styles.docThumb}
                  >
                    <ExpoImage
                      source={{ uri: doc.thumbnailUrl ? `${getApiUrl().replace(/\/$/, '')}${doc.thumbnailUrl}` : doc.fileUri }}
                      style={styles.docThumbImg}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                      recyclingKey={doc.id}
                      transition={200}
                    />
                    <Text style={styles.docThumbName} numberOfLines={1}>{doc.fileName}</Text>
                    <Text style={styles.docThumbDate}>{format(new Date(doc.createdAt), 'MMM d')}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <Text style={[styles.sectionTitle, { marginBottom: 12, marginTop: 8 }]}>⭐ Recent Entries</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSmiley = item.status === 'SMILEY';
          return (
            <View style={[styles.entryItem, { borderLeftColor: isSmiley ? Colors.smiley : Colors.sad, borderLeftWidth: 3 }]}>
              <View style={[styles.entryDot, { backgroundColor: isSmiley ? Colors.smileyBg : Colors.sadBg }]}>
                <Text style={styles.entryFaceEmoji}>{isSmiley ? '😄' : '😢'}</Text>
              </View>
              <View style={styles.entryContent}>
                <Text style={styles.entryCat}>{getCategoryName(item.categoryId)}</Text>
                <Text style={styles.entryTime}>{formatDate(item.recordedAt)}</Text>
              </View>
              <Text style={[styles.entryPoints, { color: isSmiley ? Colors.smiley : Colors.textTertiary }]}>
                +{item.pointsAwarded}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptySmall}>
            <Text style={styles.emptySmallText}>No entries yet. Record a behavior to get started!</Text>
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
  errorText: {
    fontSize: 16,
    fontFamily: 'Inter_500Medium',
    color: Colors.error,
    textAlign: 'center',
    marginTop: 40,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 22,
  },
  avatarContainer: {
    width: 100,
    height: 100,
    marginBottom: 12,
    position: 'relative',
  },
  avatarRing: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    padding: 3,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 46,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 30,
    fontFamily: 'Inter_700Bold',
    color: Colors.textInverse,
  },
  cameraBtn: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  childName: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
  },
  childAge: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
    marginTop: 3,
  },
  weekCard: {
    backgroundColor: Colors.surface,
    borderRadius: 22,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1.5,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  weekCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  weekCardTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.textSecondary,
  },
  rewardEarnedBadge: {
    backgroundColor: Colors.warningBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  rewardEarnedText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: Colors.orange,
  },
  weekStats: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  weekStatBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    gap: 2,
  },
  weekStatEmoji: {
    fontSize: 20,
  },
  weekStatValue: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  weekStatLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  progressBarWrap: {
    gap: 6,
  },
  progressBarBg: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.surfaceTertiary,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 5,
  },
  progressLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  addSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.primary + '30',
  },
  routineList: {
    borderRadius: 18,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    marginBottom: 24,
    overflow: 'hidden',
  },
  routineGroup: {},
  routineGroupHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderLeftWidth: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routineGroupEmoji: {
    fontSize: 16,
  },
  routineGroupTitle: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    flex: 1,
    letterSpacing: 0.2,
  },
  sectionPointsBadge: {
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sectionPointsText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  routineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    minHeight: 68,
  },
  routineItemName: {
    flex: 1,
    paddingRight: 10,
  },
  routineItemText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    lineHeight: 19,
  },
  faceButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  faceBtn: {
    width: 62,
    height: 62,
    borderRadius: 31,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  faceBtnActiveHappy: {
    borderColor: Colors.smiley,
  },
  faceBtnActiveSad: {
    borderColor: Colors.sad,
  },
  facePhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  entryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  entryDot: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryFaceEmoji: {
    fontSize: 20,
  },
  entryContent: {
    flex: 1,
    marginLeft: 10,
  },
  entryCat: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  entryTime: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    marginTop: 1,
  },
  entryPoints: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  emptySmall: {
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptySmallText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  docsScroll: {
    marginBottom: 20,
  },
  docThumb: {
    width: 100,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
  },
  docThumbImg: {
    width: 100,
    height: 80,
  },
  docThumbName: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    color: Colors.text,
    paddingHorizontal: 6,
    paddingTop: 5,
  },
  docThumbDate: {
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  aiInsightCard: {
    backgroundColor: '#F5F0FF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    elevation: 2,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  aiInsightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  aiInsightBadge: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  aiInsightBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  aiInsightTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: '#5B21B6',
  },
  aiRefreshBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EDE9FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiInsightDesc: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#6D28D9',
    lineHeight: 20,
    marginBottom: 14,
  },
  aiInsightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7C3AED',
    borderRadius: 14,
    paddingVertical: 13,
    elevation: 3,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
  },
  aiInsightBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  aiInsightError: {
    marginTop: 10,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.sad,
    textAlign: 'center',
  },
  aiInsightLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  aiInsightLoadingText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: '#7C3AED',
  },
  aiInsightContent: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: '#2E1065',
    lineHeight: 21,
  },
});
