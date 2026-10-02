import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useData } from '@/contexts/DataContext';
import Colors from '@/constants/colors';

export default function AddCategorySheet() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { addCategory } = useData();
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Please enter a category name');
      return;
    }
    if (!childId) {
      setError('No child selected');
      return;
    }

    setError('');
    setIsSubmitting(true);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      await addCategory(childId, name.trim());
      router.back();
    } catch {
      setError('Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const suggestions = ['Homework', 'Chores', 'Kindness', 'Listening', 'Reading', 'Exercise', 'Sharing', 'Hygiene'];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>New Category</Text>
      <Text style={styles.subtitle}>Create a behavior category to track</Text>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Category Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Homework"
            placeholderTextColor={Colors.textTertiary}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
        </View>

        <View style={styles.suggestionsWrap}>
          {suggestions.map((s) => (
            <Pressable
              key={s}
              onPress={() => setName(s)}
              style={[styles.suggestionChip, name === s && styles.suggestionChipActive]}
            >
              <Text style={[styles.suggestionText, name === s && styles.suggestionTextActive]}>{s}</Text>
            </Pressable>
          ))}
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
            <Text style={styles.submitBtnText}>Create Category</Text>
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
  suggestionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  suggestionChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  suggestionText: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  suggestionTextActive: {
    color: Colors.textInverse,
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
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.textInverse,
  },
});
