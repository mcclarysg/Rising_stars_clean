import { View, Text, Pressable, StyleSheet, Platform, Alert, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useAuth } from '@/contexts/AuthContext';
import { useData } from '@/contexts/DataContext';
import { clearAllData } from '@/lib/storage';
import Colors from '@/constants/colors';

const SEAN_IMG = require('@/assets/images/sean-avatar.png');
const NICOLE_IMG = require('@/assets/images/nicole-avatar.png');

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const isViewer = user?.role === 'VIEWER';
  const isNicole = user?.email === 'nicole@mcclary.family';
  const isSean = user?.email === 'sean@mcclary.family';
  const profilePhoto = isSean ? SEAN_IMG : isNicole ? NICOLE_IMG : null;
  const { children, entries, documents } = useData();

  const webTopInset = Platform.OS === 'web' ? 67 : 0;
  const webBottomInset = Platform.OS === 'web' ? 34 : 0;

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await logout();
        },
      },
    ]);
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all children, behavior entries, and documents. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Everything',
          style: 'destructive',
          onPress: async () => {
            if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            await clearAllData();
            await logout();
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: Colors.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + webTopInset + 16,
        paddingBottom: insets.bottom + webBottomInset + 100,
        paddingHorizontal: 20,
      }}
    >
      <Text style={styles.pageTitle}>⚙️ Settings</Text>

      <View style={styles.profileCard}>
        <View style={styles.profileAvatarRing}>
          <View style={styles.profileAvatar}>
            {profilePhoto ? (
              <Image source={profilePhoto} style={styles.profileAvatarPhoto} />
            ) : (
              <Text style={styles.profileAvatarEmoji}>👤</Text>
            )}
          </View>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{user?.name}</Text>
          <Text style={styles.profileEmail}>{user?.email}</Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText}>{user?.role === 'VIEWER' ? '👁 Viewer' : '⭐ Parent'}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Overview</Text>
      <View style={styles.statsGrid}>
        <View style={[styles.statsItem, { backgroundColor: Colors.primary + '15' }]}>
          <Text style={styles.statsEmoji}>👧🏽</Text>
          <Text style={[styles.statsValue, { color: Colors.primary }]}>{children.length}</Text>
          <Text style={styles.statsLabel}>Stars</Text>
        </View>
        <View style={[styles.statsItem, { backgroundColor: Colors.smileyBg }]}>
          <Text style={styles.statsEmoji}>😄</Text>
          <Text style={[styles.statsValue, { color: Colors.smiley }]}>{entries.length}</Text>
          <Text style={styles.statsLabel}>Entries</Text>
        </View>
        <View style={[styles.statsItem, { backgroundColor: Colors.warningBg }]}>
          <Text style={styles.statsEmoji}>📄</Text>
          <Text style={[styles.statsValue, { color: Colors.orange }]}>{documents.length}</Text>
          <Text style={styles.statsLabel}>Docs</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.menuGroup}>
        <Pressable
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: Colors.surfaceSecondary }]}
          onPress={handleLogout}
        >
          <View style={[styles.menuIconCircle, { backgroundColor: Colors.primary + '15' }]}>
            <Ionicons name="log-out-outline" size={20} color={Colors.primary} />
          </View>
          <Text style={styles.menuItemText}>Log Out</Text>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </Pressable>
      </View>

      {isSean && (
        <>
          <Text style={[styles.sectionLabel, { color: Colors.error }]}>Danger Zone</Text>
          <View style={[styles.menuGroup, { borderColor: Colors.error + '30' }]}>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: Colors.errorBg }]}
              onPress={handleClearData}
            >
              <View style={[styles.menuIconCircle, { backgroundColor: Colors.errorBg }]}>
                <Ionicons name="trash-outline" size={20} color={Colors.error} />
              </View>
              <Text style={[styles.menuItemText, { color: Colors.error }]}>Clear All Data</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.error} />
            </Pressable>
          </View>
        </>
      )}

      <Text style={styles.versionText}>McClary Stars ⭐ v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  pageTitle: {
    fontSize: 26,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    marginBottom: 20,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 18,
    marginBottom: 28,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    elevation: 3,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  profileAvatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: Colors.primary + '50',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '15',
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarEmoji: {
    fontSize: 26,
  },
  profileAvatarPhoto: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  profileName: {
    fontSize: 19,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  profileEmail: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: Colors.primary + '18',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  roleBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.primary,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    paddingLeft: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  statsItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 18,
    gap: 4,
  },
  statsEmoji: {
    fontSize: 24,
    marginBottom: 2,
  },
  statsValue: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  statsLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  menuGroup: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 28,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  menuIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    flex: 1,
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  versionText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: 8,
  },
});
