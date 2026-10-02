import { View, Text, Pressable, StyleSheet, Platform, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/query-client';
import Colors from '@/constants/colors';
import ChildHeroBg from '@/components/ChildHeroBg';

const ISAAC_IMG = require('@/assets/images/isaac-avatar.png');
const ISAIAH_IMG = require('@/assets/images/isaiah-avatar.png');
const NICOLE_IMG = require('@/assets/images/nicole-avatar.png');
const SEAN_IMG = require('@/assets/images/sean-avatar.png');

const PROFILES = [
  {
    id: 'sean',
    name: 'Sean',
    email: 'sean@mcclary.family',
    role: 'PARENT' as const,
    gradientColors: ['#2AACE2', '#1B7EC2'] as [string, string],
    initial: 'S',
    emoji: '👨',
    photo: SEAN_IMG,
    label: 'Dad',
  },
  {
    id: 'nicole',
    name: 'Nicole',
    email: 'nicole@mcclary.family',
    role: 'PARENT' as const,
    gradientColors: ['#A78BFA', '#7C3AED'] as [string, string],
    initial: 'N',
    emoji: '👩',
    photo: NICOLE_IMG,
    label: 'Mom',
  },
];

const TEST_PROFILE = {
  id: 'camila',
  name: 'Camila',
  email: 'camila@test.family',
  role: 'PARENT' as const,
  gradientColors: ['#F59E0B', '#D97706'] as [string, string],
  initial: 'C',
  label: 'Test User',
};

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { login } = useAuth();

  const webTop = Platform.OS === 'web' ? 67 : 0;

  const handleProfileLogin = async (profile: typeof PROFILES[0]) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await login(profile.email, profile.name, profile.role);
    router.replace('/(tabs)');
  };

  const handleTestLogin = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await login(TEST_PROFILE.email, TEST_PROFILE.name, TEST_PROFILE.role);
    try { await apiRequest('POST', '/api/seed-test-patient', {}); } catch {}
    router.replace('/(tabs)');
  };

  const handleGuest = async () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await login('guest@mcclary.family', 'Guest', 'VIEWER');
    router.replace('/(tabs)');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + webTop }]}>
      <ChildHeroBg style={styles.hero}>
        <View style={styles.heroContent}>
          <View style={styles.kidsRow}>
            <View style={styles.kidCircleWrapper}>
              <View style={styles.kidCircleRing}>
                <Image source={ISAAC_IMG} style={styles.kidCircle} resizeMode="cover" />
              </View>
              <View style={styles.kidLabel}>
                <Text style={styles.kidLabelText}>Isaac ⭐</Text>
              </View>
            </View>
            <View style={[styles.kidCircleWrapper, { marginLeft: -28 }]}>
              <View style={[styles.kidCircleRing, { borderColor: Colors.purple }]}>
                <Image source={ISAIAH_IMG} style={styles.kidCircle} resizeMode="cover" />
              </View>
              <View style={[styles.kidLabel, { backgroundColor: 'rgba(167,139,250,0.85)' }]}>
                <Text style={styles.kidLabelText}>Isaiah ⭐</Text>
              </View>
            </View>
          </View>
          <Text style={styles.heroTitle}>McClary Stars ⭐</Text>
          <Text style={styles.heroSubtitle}>Who's signing in today?</Text>
        </View>
      </ChildHeroBg>

      <View style={[styles.card, { paddingBottom: insets.bottom + 40 }]}>
        <Text style={styles.cardTitle}>Welcome back!</Text>
        <Text style={styles.cardSubtitle}>Select your profile to continue</Text>

        {/* Parent Profiles */}
        <View style={styles.profilesRow}>
          {PROFILES.map((profile) => (
            <View key={profile.id} style={styles.profileCard}>
              {profile.photo ? (
                <Image
                  source={profile.photo}
                  style={styles.profileAvatarImg}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={profile.gradientColors}
                  style={styles.profileAvatar}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Text style={styles.profileInitial}>{profile.initial}</Text>
                </LinearGradient>
              )}
              <Text style={styles.profileName}>{profile.name}</Text>
              <Text style={styles.profileLabel}>{profile.label}</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.profileBtn,
                  { backgroundColor: profile.gradientColors[0] },
                  pressed && { opacity: 0.82, transform: [{ scale: 0.97 }] },
                ]}
                onPress={() => handleProfileLogin(profile)}
              >
                <Ionicons name="checkmark-circle" size={15} color="#fff" />
                <Text style={styles.profileBtnText}>Sign in</Text>
              </Pressable>
            </View>
          ))}
        </View>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Guest Option */}
        <Pressable
          style={({ pressed }) => [styles.guestCard, pressed && { opacity: 0.8 }]}
          onPress={handleGuest}
        >
          <View style={styles.guestAvatarSmall}>
            <Ionicons name="person-outline" size={20} color={Colors.textSecondary} />
          </View>
          <View style={styles.guestInfo}>
            <Text style={styles.guestName}>Guest</Text>
            <Text style={styles.guestNote}>View-only — no medical or AI access</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.guestBtn, pressed && { opacity: 0.8 }]}
            onPress={handleGuest}
          >
            <Text style={styles.guestBtnText}>Continue as Viewer</Text>
          </Pressable>
        </Pressable>

        {/* Test User */}
        <Pressable
          style={({ pressed }) => [styles.guestCard, { marginTop: 12, borderColor: '#F59E0B40' }, pressed && { opacity: 0.8 }]}
          onPress={handleTestLogin}
        >
          <LinearGradient
            colors={TEST_PROFILE.gradientColors}
            style={styles.guestAvatarSmall}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: '#fff' }}>{TEST_PROFILE.initial}</Text>
          </LinearGradient>
          <View style={styles.guestInfo}>
            <Text style={styles.guestName}>Camila Lopez</Text>
            <Text style={styles.guestNote}>Test patient with sample medical records</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.guestBtn, { borderColor: '#F59E0B', backgroundColor: '#FFFBEB' }, pressed && { opacity: 0.8 }]}
            onPress={handleTestLogin}
          >
            <Text style={[styles.guestBtnText, { color: '#D97706' }]}>Test Mode</Text>
          </Pressable>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  hero: {
    minHeight: 270,
    justifyContent: 'flex-end',
  },
  heroContent: {
    alignItems: 'center',
    paddingBottom: 28,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  kidsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 18,
  },
  kidCircleWrapper: {
    alignItems: 'center',
  },
  kidCircleRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 4,
    borderColor: Colors.yellow,
    padding: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  kidCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  kidLabel: {
    marginTop: 7,
    backgroundColor: 'rgba(27,159,229,0.85)',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  kidLabelText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  heroTitle: {
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    color: '#0A3050',
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: '#1A5F8A',
    marginTop: 4,
    textAlign: 'center',
  },
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -24,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  cardTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
  },
  profilesRow: {
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'center',
  },
  profileCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: 24,
    paddingVertical: 22,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    gap: 12,
    elevation: 2,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  profileAvatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  profileAvatarImg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  profileInitial: {
    fontSize: 38,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  profileName: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  profileLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
    marginTop: -6,
  },
  profileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 14,
    width: '100%',
    justifyContent: 'center',
  },
  profileBtnText: {
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 22,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.borderLight,
  },
  dividerText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.textTertiary,
  },
  guestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.background,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
  },
  guestAvatarSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestInfo: {
    flex: 1,
  },
  guestName: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  guestNote: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    color: Colors.textTertiary,
    marginTop: 2,
  },
  guestBtn: {
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  guestBtnText: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    color: Colors.textSecondary,
  },
});
