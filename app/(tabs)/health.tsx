import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Platform, Image, ActivityIndicator, Alert, Modal, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  getDay, isSameDay, isToday, subMonths, addMonths,
} from 'date-fns';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/query-client';
import Colors from '@/constants/colors';

WebBrowser.maybeCompleteAuthSession();

const ISAAC_HAPPY = require('@/assets/images/isaac-happy.png');
const ISAAC_SAD = require('@/assets/images/isaac-sad.png');
const ISAIAH_HAPPY = require('@/assets/images/isaiah-happy.png');
const ISAIAH_SAD = require('@/assets/images/isaiah-sad.png');

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type Filter = 'all' | string;

interface DayStats {
  smiley: number;
  sad: number;
  total: number;
}

function getDayBg(stats: DayStats): string {
  if (stats.total === 0) return 'transparent';
  const ratio = stats.smiley / stats.total;
  if (ratio >= 0.8) return '#4DC97A';
  if (ratio >= 0.6) return '#A8E063';
  if (ratio >= 0.4) return '#FFD93D';
  if (ratio >= 0.2) return '#FF9A3C';
  return '#FF6B6B';
}

function getDayEmoji(stats: DayStats): string {
  if (stats.total === 0) return '';
  const ratio = stats.smiley / stats.total;
  if (ratio >= 0.8) return '🌟';
  if (ratio >= 0.6) return '😊';
  if (ratio >= 0.4) return '😐';
  if (ratio >= 0.2) return '😕';
  return '😔';
}

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { entries, children, categories, appointments, addAppointment, removeAppointment, refreshData } = useData();
  const { user } = useAuth();
  const isViewer = user?.role === 'VIEWER';
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const [fhirConnected, setFhirConnected] = useState(false);
  const [fhirHasClientId, setFhirHasClientId] = useState(false);
  const [fhirConnecting, setFhirConnecting] = useState(false);
  const [fhirSyncing, setFhirSyncing] = useState<string | null>(null);
  const [showApptModal, setShowApptModal] = useState(false);
  const [apptSaving, setApptSaving] = useState(false);
  const [apptForm, setApptForm] = useState({ title: '', provider: '', location: '', date: '', childId: '' });

  const checkFhirStatus = useCallback(async () => {
    try {
      const res = await apiRequest('GET', '/api/fhir/status');
      const data = await res.json();
      setFhirConnected(!!data.connected);
      setFhirHasClientId(!!data.hasClientId);
    } catch {}
  }, []);

  const connectingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopConnecting = useCallback(() => {
    setFhirConnecting(false);
    if (connectingTimerRef.current) { clearTimeout(connectingTimerRef.current); connectingTimerRef.current = null; }
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  }, []);

  useEffect(() => {
    checkFhirStatus();
  }, [checkFhirStatus]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handler = (event: MessageEvent) => {
      if (event.data === 'fhir-connected') {
        checkFhirStatus();
        stopConnecting();
      } else if (event.data === 'fhir-error') {
        stopConnecting();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [checkFhirStatus, stopConnecting]);

  const connectMyChart = useCallback(async () => {
    try {
      setFhirConnecting(true);

      connectingTimerRef.current = setTimeout(() => {
        stopConnecting();
      }, 120000);

      if (Platform.OS === 'web') {
        const res = await apiRequest('GET', '/api/fhir/auth-url');
        const data = await res.json();
        if (data.error) {
          Alert.alert('Setup Required', data.error);
          stopConnecting();
          return;
        }
        const popup = window.open(data.url, 'mychart-auth', 'width=600,height=700,scrollbars=yes');
        if (!popup || popup.closed) {
          Alert.alert('Popup Blocked', 'Please allow popups for this site and try again.');
          stopConnecting();
          return;
        }

        pollingRef.current = setInterval(async () => {
          try {
            const statusRes = await apiRequest('GET', '/api/fhir/status');
            const statusData = await statusRes.json();
            if (statusData.connected) {
              setFhirConnected(true);
              stopConnecting();
              try { popup.close(); } catch {}
            }
          } catch {}
        }, 3000);
      } else {
        const redirectUri = Linking.createURL('health');
        const res = await apiRequest('GET', `/api/fhir/auth-url?redirect_uri=${encodeURIComponent(redirectUri)}`);
        const data = await res.json();
        if (data.error) {
          Alert.alert('Setup Required', data.error);
          stopConnecting();
          return;
        }

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
        if (result.type === 'success') {
          const url = new URL(result.url);
          const code = url.searchParams.get('code');
          const returnedState = url.searchParams.get('state');

          if (code && returnedState) {
            const exchangeRes = await apiRequest('POST', '/api/fhir/exchange', {
              code,
              state: returnedState,
            });
            const exchangeData = await exchangeRes.json();
            if (exchangeData.error) {
              throw new Error(exchangeData.error);
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }

        await checkFhirStatus();
        stopConnecting();
      }
    } catch (e: any) {
      Alert.alert('Connection Error', e.message || 'Failed to connect to MyChart');
      stopConnecting();
    }
  }, [checkFhirStatus, stopConnecting]);

  const syncFhirDocs = useCallback(async (childId: string) => {
    try {
      setFhirSyncing(childId);
      const res = await apiRequest('POST', '/api/fhir/sync', { childId });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await refreshData();
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Synced!', `${data.synced} new document${data.synced !== 1 ? 's' : ''} imported from MyChart.`);
    } catch (e: any) {
      Alert.alert('Sync Failed', e.message);
    } finally {
      setFhirSyncing(null);
    }
  }, [refreshData]);

  const disconnectFhir = useCallback(() => {
    Alert.alert('Disconnect MyChart', 'Remove the VCU Health MyChart connection?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect', style: 'destructive',
        onPress: async () => {
          await apiRequest('DELETE', '/api/fhir/disconnect');
          setFhirConnected(false);
        },
      },
    ]);
  }, []);

  const webTop = Platform.OS === 'web' ? 67 : 0;
  const webBottom = Platform.OS === 'web' ? 34 : 0;

  const filteredEntries = useMemo(
    () => (filter === 'all' ? entries : entries.filter((e) => e.childId === filter)),
    [entries, filter],
  );

  const dayStatsMap = useMemo(() => {
    const map: Record<string, DayStats> = {};
    for (const entry of filteredEntries) {
      const key = format(new Date(entry.recordedAt), 'yyyy-MM-dd');
      if (!map[key]) map[key] = { smiley: 0, sad: 0, total: 0 };
      map[key].total++;
      if (entry.status === 'SMILEY') map[key].smiley++;
      else map[key].sad++;
    }
    return map;
  }, [filteredEntries]);

  const monthPrefix = format(currentMonth, 'yyyy-MM');
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPadding = getDay(monthStart);
  const calendarCells: (Date | null)[] = [
    ...Array(startPadding).fill(null),
    ...daysInMonth,
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const monthEntries = useMemo(
    () => filteredEntries.filter((e) => format(new Date(e.recordedAt), 'yyyy-MM') === monthPrefix),
    [filteredEntries, monthPrefix],
  );
  const monthSmiley = monthEntries.filter((e) => e.status === 'SMILEY').length;
  const monthSad = monthEntries.filter((e) => e.status === 'SAD').length;
  const monthTotal = monthEntries.length;
  const monthPosPct = monthTotal > 0 ? Math.round((monthSmiley / monthTotal) * 100) : 0;
  const activeDays = Object.keys(dayStatsMap).filter((k) => k.startsWith(monthPrefix)).length;

  const selectedDayEntries = useMemo(() => {
    if (!selectedDay) return [];
    return filteredEntries
      .filter((e) => isSameDay(new Date(e.recordedAt), selectedDay))
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }, [selectedDay, filteredEntries]);

  const filteredAppts = useMemo(
    () => (filter === 'all' ? appointments : appointments.filter((a) => !a.childId || a.childId === filter)),
    [appointments, filter],
  );

  const apptsByDate = useMemo(() => {
    const map: Record<string, typeof appointments> = {};
    for (const appt of filteredAppts) {
      try {
        const key = format(new Date(appt.appointmentDate), 'yyyy-MM-dd');
        if (!map[key]) map[key] = [];
        map[key].push(appt);
      } catch { /* skip */ }
    }
    return map;
  }, [filteredAppts]);

  const monthAppts = useMemo(
    () => filteredAppts.filter((a) => {
      try { return format(new Date(a.appointmentDate), 'yyyy-MM') === monthPrefix; } catch { return false; }
    }),
    [filteredAppts, monthPrefix],
  );

  const selectedDayAppts = useMemo(() => {
    if (!selectedDay) return [];
    return filteredAppts.filter((a) => {
      try { return isSameDay(new Date(a.appointmentDate), selectedDay); } catch { return false; }
    });
  }, [selectedDay, filteredAppts]);

  const handleAddAppt = useCallback(async () => {
    if (!apptForm.title.trim()) { Alert.alert('Required', 'Please enter an appointment title.'); return; }
    if (!apptForm.date.trim()) { Alert.alert('Required', 'Please enter a date (YYYY-MM-DD HH:MM).'); return; }
    try {
      setApptSaving(true);
      const dateVal = new Date(apptForm.date.trim());
      if (isNaN(dateVal.getTime())) { Alert.alert('Invalid Date', 'Use format: YYYY-MM-DD or YYYY-MM-DD HH:MM'); return; }
      await addAppointment({
        title: apptForm.title.trim(),
        provider: apptForm.provider.trim() || undefined,
        location: apptForm.location.trim() || undefined,
        appointmentDate: dateVal.toISOString(),
        childId: apptForm.childId || undefined,
        createdBy: user?.id,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setApptForm({ title: '', provider: '', location: '', date: '', childId: '' });
      setShowApptModal(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setApptSaving(false);
    }
  }, [apptForm, addAppointment, user]);

  const getChildName = (childId: string) =>
    children.find((c) => c.id === childId)?.firstName || 'Unknown';

  const getCategoryName = (catId: string) =>
    categories.find((c) => c.id === catId)?.name || 'Category';

  const getChildHappyImg = (childId: string) => {
    const name = children.find((c) => c.id === childId)?.firstName;
    return name === 'Isaiah' ? ISAIAH_HAPPY : ISAAC_HAPPY;
  };

  const getChildSadImg = (childId: string) => {
    const name = children.find((c) => c.id === childId)?.firstName;
    return name === 'Isaiah' ? ISAIAH_SAD : ISAAC_SAD;
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + webTop + 12,
          paddingBottom: insets.bottom + webBottom + 110,
        }}
      >
        {/* Page Header */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>📅 Calendar</Text>
          <Text style={styles.pageSubtitle}>Tap any day to see entries</Text>
        </View>

        {/* MyChart / Epic FHIR Section */}
        {!isViewer && (
          <View style={styles.mychartCard}>
            <View style={styles.mychartHeader}>
              <View style={styles.mychartLogoWrap}>
                <Ionicons name="medical" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mychartTitle}>VCU Health MyChart</Text>
                <Text style={styles.mychartSubtitle}>Auto-import medical records after every visit</Text>
              </View>
              {fhirConnected && (
                <Pressable onPress={disconnectFhir} style={styles.mychartDisconnect}>
                  <Ionicons name="unlink-outline" size={16} color={Colors.textTertiary} />
                </Pressable>
              )}
            </View>

            {!fhirHasClientId ? (
              <View style={styles.mychartSetupRow}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.warning} />
                <Text style={styles.mychartSetupText}>
                  Register at <Text style={{ fontWeight: '700' }}>fhir.epic.com</Text> and add{' '}
                  <Text style={{ fontWeight: '700' }}>EPIC_CLIENT_ID</Text> to environment secrets to enable.
                </Text>
              </View>
            ) : fhirConnected ? (
              <View>
                <View style={styles.mychartConnectedRow}>
                  <Ionicons name="checkmark-circle" size={16} color="#4DC97A" />
                  <Text style={styles.mychartConnectedText}>Connected — tap a child to sync latest records</Text>
                </View>
                <View style={styles.mychartChildRow}>
                  {children.map((child) => (
                    <Pressable
                      key={child.id}
                      style={({ pressed }) => [styles.mychartChildBtn, pressed && { opacity: 0.75 }]}
                      onPress={() => syncFhirDocs(child.id)}
                      disabled={fhirSyncing === child.id}
                    >
                      {fhirSyncing === child.id ? (
                        <ActivityIndicator size="small" color={Colors.primary} />
                      ) : (
                        <Ionicons name="sync-outline" size={14} color={Colors.primary} />
                      )}
                      <Text style={styles.mychartChildName}>{child.firstName}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : (
              <Pressable
                style={({ pressed }) => [styles.mychartConnectBtn, pressed && { opacity: 0.85 }]}
                onPress={connectMyChart}
                disabled={fhirConnecting}
              >
                {fhirConnecting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="link-outline" size={16} color="#fff" />
                )}
                <Text style={styles.mychartConnectText}>
                  {fhirConnecting ? 'Waiting for login…' : 'Connect MyChart'}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Child Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={{ marginBottom: 14 }}
        >
          {[{ id: 'all', label: '👨‍👩‍👦 All' }, ...children.map((c) => ({ id: c.id, label: `⭐ ${c.firstName}` }))].map(
            (opt) => (
              <Pressable
                key={opt.id}
                style={[styles.filterChip, filter === opt.id && styles.filterChipActive]}
                onPress={() => {
                  setFilter(opt.id);
                  if (Platform.OS !== 'web') Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.filterChipText, filter === opt.id && styles.filterChipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            ),
          )}
        </ScrollView>

        {/* Month Summary Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: Colors.smileyBg }]}>
            <Text style={styles.statEmoji}>😄</Text>
            <Text style={[styles.statValue, { color: Colors.smiley }]}>{monthSmiley}</Text>
            <Text style={styles.statLabel}>Happy</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: Colors.sadBg }]}>
            <Text style={styles.statEmoji}>😢</Text>
            <Text style={[styles.statValue, { color: Colors.sad }]}>{monthSad}</Text>
            <Text style={styles.statLabel}>Sad</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: Colors.primary + '15' }]}>
            <Text style={styles.statEmoji}>📆</Text>
            <Text style={[styles.statValue, { color: Colors.primary }]}>{activeDays}</Text>
            <Text style={styles.statLabel}>Days</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: '#FFF3E0' }]}>
            <Text style={styles.statEmoji}>✨</Text>
            <Text style={[styles.statValue, { color: Colors.orange }]}>{monthPosPct}%</Text>
            <Text style={styles.statLabel}>Positive</Text>
          </View>
        </View>

        {/* Appointments Section */}
        <View style={styles.apptSection}>
          <View style={styles.apptSectionHeader}>
            <View style={styles.apptSectionLeft}>
              <Ionicons name="calendar-outline" size={16} color="#F59E0B" />
              <Text style={styles.apptSectionTitle}>Appointments</Text>
              {monthAppts.length > 0 && (
                <View style={styles.apptBadge}>
                  <Text style={styles.apptBadgeText}>{monthAppts.length}</Text>
                </View>
              )}
            </View>
            {!isViewer && (
              <Pressable
                style={({ pressed }) => [styles.apptAddBtn, pressed && { opacity: 0.75 }]}
                onPress={() => {
                  setApptForm({ title: '', provider: '', location: '', date: format(new Date(), 'yyyy-MM-dd'), childId: children[0]?.id || '' });
                  setShowApptModal(true);
                }}
              >
                <Ionicons name="add" size={16} color="#F59E0B" />
                <Text style={styles.apptAddText}>Add</Text>
              </Pressable>
            )}
          </View>
          {monthAppts.length === 0 ? (
            <Text style={styles.apptEmpty}>No appointments this month</Text>
          ) : (
            <View style={styles.apptList}>
              {monthAppts.map((appt) => {
                const childName = appt.childId ? children.find((c) => c.id === appt.childId)?.firstName : null;
                return (
                  <View key={appt.id} style={styles.apptRow}>
                    <View style={styles.apptDateBubble}>
                      <Text style={styles.apptDateDay}>{format(new Date(appt.appointmentDate), 'd')}</Text>
                      <Text style={styles.apptDateMon}>{format(new Date(appt.appointmentDate), 'MMM')}</Text>
                    </View>
                    <View style={styles.apptInfo}>
                      <Text style={styles.apptTitle} numberOfLines={1}>{appt.title}</Text>
                      <Text style={styles.apptMeta}>
                        {format(new Date(appt.appointmentDate), 'h:mm a')}
                        {appt.provider ? ` · ${appt.provider}` : ''}
                        {childName ? ` · ${childName}` : ''}
                      </Text>
                    </View>
                    {!isViewer && (
                      <Pressable hitSlop={8} onPress={() => removeAppointment(appt.id)}>
                        <Ionicons name="close-circle-outline" size={18} color={Colors.textTertiary} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Calendar Card */}
        <View style={styles.calCard}>
          {/* Month Nav */}
          <View style={styles.monthNav}>
            <Pressable
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
              onPress={() => { setCurrentMonth((m) => subMonths(m, 1)); setSelectedDay(null); }}
            >
              <Ionicons name="chevron-back" size={22} color={Colors.primary} />
            </Pressable>
            <Text style={styles.monthTitle}>{format(currentMonth, 'MMMM yyyy')}</Text>
            <Pressable
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.6 }]}
              onPress={() => { setCurrentMonth((m) => addMonths(m, 1)); setSelectedDay(null); }}
            >
              <Ionicons name="chevron-forward" size={22} color={Colors.primary} />
            </Pressable>
          </View>

          {/* Weekday Headers */}
          <View style={styles.weekRow}>
            {DAY_LABELS.map((d) => (
              <Text key={d} style={styles.weekLabel}>{d}</Text>
            ))}
          </View>

          {/* Day Grid */}
          <View style={styles.grid}>
            {calendarCells.map((day, i) => {
              if (!day) return <View key={`pad-${i}`} style={styles.cell} />;
              const key = format(day, 'yyyy-MM-dd');
              const stats = dayStatsMap[key] ?? { smiley: 0, sad: 0, total: 0 };
              const bgColor = getDayBg(stats);
              const emoji = getDayEmoji(stats);
              const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
              const isT = isToday(day);
              return (
                <Pressable
                  key={key}
                  style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]}
                  onPress={() => {
                    if (Platform.OS !== 'web') Haptics.selectionAsync();
                    setSelectedDay(isSelected ? null : day);
                  }}
                >
                  <View
                    style={[
                      styles.cellInner,
                      stats.total > 0 && { backgroundColor: bgColor + '35' },
                      isSelected && { backgroundColor: Colors.primary },
                      isT && !isSelected && styles.cellToday,
                    ]}
                  >
                    {stats.total > 0 && !isSelected && (
                      <View style={[styles.cellDot, { backgroundColor: bgColor }]} />
                    )}
                    <Text
                      style={[
                        styles.cellNum,
                        isT && styles.cellNumToday,
                        isSelected && styles.cellNumSelected,
                      ]}
                    >
                      {format(day, 'd')}
                    </Text>
                    {emoji ? <Text style={styles.cellEmoji}>{emoji}</Text> : null}
                    {apptsByDate[key]?.length > 0 && (
                      <View style={[styles.apptDot, isSelected && { backgroundColor: '#fff' }]} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            {[
              { c: '#4DC97A', label: 'Great (80%+)' },
              { c: '#FFD93D', label: 'Mixed' },
              { c: '#FF6B6B', label: 'Tough' },
            ].map((l) => (
              <View key={l.label} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: l.c }]} />
                <Text style={styles.legendLabel}>{l.label}</Text>
              </View>
            ))}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.legendLabel}>Appt</Text>
            </View>
          </View>
        </View>

        {/* Day Detail Panel */}
        {selectedDay && (
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>
                {isToday(selectedDay) ? '📅 Today' : `📅 ${format(selectedDay, 'MMMM d, yyyy')}`}
              </Text>
              <Pressable
                style={styles.detailClose}
                onPress={() => setSelectedDay(null)}
              >
                <Ionicons name="close" size={18} color={Colors.textSecondary} />
              </Pressable>
            </View>

            {selectedDayAppts.length > 0 && (
              <View style={styles.dayApptSection}>
                {selectedDayAppts.map((appt) => (
                  <View key={appt.id} style={styles.dayApptRow}>
                    <View style={styles.dayApptIcon}>
                      <Ionicons name="calendar" size={14} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dayApptTitle}>{appt.title}</Text>
                      <Text style={styles.dayApptMeta}>
                        {format(new Date(appt.appointmentDate), 'h:mm a')}
                        {appt.provider ? ` · ${appt.provider}` : ''}
                        {appt.location ? ` · ${appt.location}` : ''}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {selectedDayEntries.length === 0 ? (
              <View style={styles.detailEmpty}>
                <Text style={styles.detailEmptyText}>No behavior entries on this day.</Text>
              </View>
            ) : (
              <View style={styles.detailEntries}>
                {selectedDayEntries.map((entry) => {
                  const isSmiley = entry.status === 'SMILEY';
                  return (
                    <View
                      key={entry.id}
                      style={[
                        styles.entryRow,
                        { borderLeftColor: isSmiley ? Colors.smiley : Colors.sad },
                      ]}
                    >
                      <Image
                        source={isSmiley ? getChildHappyImg(entry.childId) : getChildSadImg(entry.childId)}
                        style={styles.entryImg}
                        resizeMode="cover"
                      />
                      <View style={styles.entryInfo}>
                        <Text style={styles.entryChild}>{getChildName(entry.childId)}</Text>
                        <Text style={styles.entryCat}>{getCategoryName(entry.categoryId)}</Text>
                        <Text style={styles.entryTime}>
                          {format(new Date(entry.recordedAt), 'h:mm a')}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.entryPts,
                          { backgroundColor: isSmiley ? Colors.smileyBg : Colors.surfaceSecondary },
                        ]}
                      >
                        <Text
                          style={[
                            styles.entryPtsText,
                            { color: isSmiley ? Colors.smiley : Colors.textTertiary },
                          ]}
                        >
                          +{entry.pointsAwarded}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Add Appointment Modal */}
        <Modal
          visible={showApptModal}
          animationType="slide"
          transparent
          onRequestClose={() => setShowApptModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={[styles.modalHeader, { backgroundColor: '#F59E0B' }]}>
                <View style={styles.modalLogoWrap}>
                  <Ionicons name="calendar" size={26} color="#fff" />
                </View>
                <Text style={styles.modalTitle}>Add Appointment</Text>
                <Text style={styles.modalSubtitle}>Doctor visit, checkup, or specialist</Text>
              </View>
              <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
                <Text style={styles.apptFormLabel}>Title *</Text>
                <TextInput
                  style={styles.apptFormInput}
                  placeholder="e.g. Well Child Visit"
                  placeholderTextColor={Colors.textTertiary}
                  value={apptForm.title}
                  onChangeText={(v) => setApptForm((f) => ({ ...f, title: v }))}
                />
                <Text style={styles.apptFormLabel}>Date *</Text>
                <TextInput
                  style={styles.apptFormInput}
                  placeholder="YYYY-MM-DD or YYYY-MM-DD HH:MM"
                  placeholderTextColor={Colors.textTertiary}
                  value={apptForm.date}
                  onChangeText={(v) => setApptForm((f) => ({ ...f, date: v }))}
                  autoCapitalize="none"
                />
                <Text style={styles.apptFormLabel}>Provider (optional)</Text>
                <TextInput
                  style={styles.apptFormInput}
                  placeholder="e.g. Dr. Sarah Chen"
                  placeholderTextColor={Colors.textTertiary}
                  value={apptForm.provider}
                  onChangeText={(v) => setApptForm((f) => ({ ...f, provider: v }))}
                />
                <Text style={styles.apptFormLabel}>Location (optional)</Text>
                <TextInput
                  style={styles.apptFormInput}
                  placeholder="e.g. VCU Health Children's"
                  placeholderTextColor={Colors.textTertiary}
                  value={apptForm.location}
                  onChangeText={(v) => setApptForm((f) => ({ ...f, location: v }))}
                />
                <Text style={styles.apptFormLabel}>Child (optional)</Text>
                <View style={styles.apptChildRow}>
                  {[{ id: '', label: 'All' }, ...children.map((c) => ({ id: c.id, label: c.firstName }))].map((opt) => (
                    <Pressable
                      key={opt.id}
                      style={[styles.apptChildChip, apptForm.childId === opt.id && styles.apptChildChipActive]}
                      onPress={() => setApptForm((f) => ({ ...f, childId: opt.id }))}
                    >
                      <Text style={[styles.apptChildChipText, apptForm.childId === opt.id && { color: '#fff' }]}>{opt.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <Pressable style={styles.modalDeny} onPress={() => setShowApptModal(false)}>
                  <Text style={styles.modalDenyText}>Cancel</Text>
                </Pressable>
                <Pressable style={[styles.modalAllow, { backgroundColor: '#F59E0B' }]} onPress={handleAddAppt} disabled={apptSaving}>
                  {apptSaving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalAllowText}>Save Appointment</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>



      </ScrollView>
    </View>
  );
}



const styles = StyleSheet.create({
  container: { flex: 1 },
  pageHeader: { paddingHorizontal: 20, marginBottom: 14 },
  pageTitle: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  pageSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 3,
  },
  filterRow: { paddingHorizontal: 20, gap: 8 },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
  filterChipTextActive: { color: '#fff' },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 16,
    gap: 1,
  },
  statEmoji: { fontSize: 18 },
  statValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  calCard: {
    backgroundColor: Colors.surface,
    borderRadius: 24,
    marginHorizontal: 16,
    paddingBottom: 14,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    elevation: 3,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    marginBottom: 16,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingTop: 16,
    paddingBottom: 12,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthTitle: {
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  cell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 0.88,
    padding: 2,
  },
  cellInner: {
    flex: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    position: 'relative',
  },
  cellToday: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  cellDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  cellNum: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  cellNumToday: { color: Colors.primary },
  cellNumSelected: { color: '#fff' },
  cellEmoji: { fontSize: 10 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    paddingTop: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  detailCard: {
    backgroundColor: Colors.surface,
    borderRadius: 22,
    marginHorizontal: 16,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  detailTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  detailClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailEmpty: { paddingVertical: 24, alignItems: 'center' },
  detailEmptyText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  detailEntries: { padding: 12, gap: 8 },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 14,
    padding: 10,
    borderLeftWidth: 4,
    gap: 10,
  },
  entryImg: { width: 40, height: 40, borderRadius: 20 },
  entryInfo: { flex: 1 },
  entryChild: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: Colors.primary,
  },
  entryCat: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.text,
    marginTop: 1,
  },
  entryTime: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    marginTop: 1,
  },
  entryPts: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  entryPtsText: { fontSize: 13, fontFamily: 'Inter_700Bold' },

  mychartCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  mychartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  mychartLogoWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#C8102E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mychartTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  mychartSubtitle: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 1,
  },
  mychartDisconnect: {
    padding: 6,
  },
  mychartSetupRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.warningBg,
    borderRadius: 10,
    padding: 10,
  },
  mychartSetupText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
    lineHeight: 18,
  },
  mychartConnectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  mychartConnectedText: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  mychartChildRow: {
    flexDirection: 'row',
    gap: 10,
  },
  mychartChildBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.primary + '15',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  mychartChildName: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.primary,
  },
  mychartConnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#C8102E',
    borderRadius: 12,
    paddingVertical: 12,
  },
  mychartConnectText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
  },
  apptDot: {
    position: 'absolute',
    bottom: 3,
    right: 4,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  apptSection: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#FEF3C7',
    padding: 14,
    elevation: 2,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  apptSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  apptSectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  apptSectionTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', color: Colors.text },
  apptBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  apptBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
  apptAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  apptAddText: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#F59E0B' },
  apptEmpty: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textTertiary, textAlign: 'center', paddingVertical: 4 },
  apptList: { gap: 8 },
  apptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  apptDateBubble: {
    width: 40,
    alignItems: 'center',
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingVertical: 4,
  },
  apptDateDay: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' },
  apptDateMon: { fontSize: 10, fontFamily: 'Inter_500Medium', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' },
  apptInfo: { flex: 1 },
  apptTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  apptMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 1 },
  dayApptSection: {
    gap: 6,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  dayApptRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dayApptIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dayApptTitle: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text },
  dayApptMeta: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 1 },
  apptFormLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.textSecondary, marginBottom: 6, marginTop: 8 },
  apptFormInput: {
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  apptChildRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  apptChildChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  apptChildChipActive: { backgroundColor: '#F59E0B', borderColor: '#F59E0B' },
  apptChildChipText: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  modalHeader: {
    backgroundColor: '#1565C0',
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 20,
    gap: 8,
  },
  modalLogoWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: 'rgba(255,255,255,0.75)',
  },
  modalBody: {
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 8,
    gap: 12,
  },
  modalBodyTitle: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
    marginBottom: 4,
  },
  modalPerm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalPermText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
  },
  modalNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: Colors.surfaceSecondary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modalNoticeText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 36,
  },
  modalDeny: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
  },
  modalDenyText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
  modalAllow: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#1565C0',
    alignItems: 'center',
  },
  modalAllowText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
});
