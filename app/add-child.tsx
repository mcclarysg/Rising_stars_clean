import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useData } from '@/contexts/DataContext';
import Colors from '@/constants/colors';

export default function AddChildSheet() {
  const { addChild } = useData();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const formatDob = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 4) return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
  };

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim() || !dob.trim()) {
      setError('Please fill in all fields');
      return;
    }
    const parts = dob.split('/');
    if (parts.length !== 3 || parts[2].length !== 4) {
      setError('Date format: MM/DD/YYYY');
      return;
    }
    const dateObj = new Date(`${parts[2]}-${parts[0]}-${parts[1]}`);
    if (isNaN(dateObj.getTime())) {
      setError('Please enter a valid date');
      return;
    }

    setError('');
    setIsSubmitting(true);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      await addChild(firstName.trim(), lastName.trim(), dateObj.toISOString());
      router.back();
    } catch {
      setError('Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Add Child</Text>
      <Text style={styles.subtitle}>Enter your child's information</Text>

      <View style={styles.form}>
        <View style={styles.nameRow}>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>First Name</Text>
            <TextInput
              style={styles.input}
              placeholder="First"
              placeholderTextColor={Colors.textTertiary}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>
          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Last Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Last"
              placeholderTextColor={Colors.textTertiary}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              returnKeyType="next"
            />
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Date of Birth</Text>
          <TextInput
            style={styles.input}
            placeholder="MM/DD/YYYY"
            placeholderTextColor={Colors.textTertiary}
            value={dob}
            onChangeText={(text) => setDob(formatDob(text))}
            keyboardType="number-pad"
            maxLength={10}
            returnKeyType="done"
          />
        </View>

        {!!error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={14} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
            isSubmitting && { opacity: 0.6 },
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.textInverse} />
          ) : (
            <Text style={styles.submitBtnText}>Add Child</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    paddingTop: 12,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 4,
    marginBottom: 24,
  },
  form: {
    gap: 18,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    height: 50,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.errorBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.error,
  },
  submitBtn: {
    height: 52,
    backgroundColor: Colors.primary,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.textInverse,
  },
});
