import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useData } from '@/contexts/DataContext';
import Colors from '@/constants/colors';
import type { BehaviorStatus } from '@/lib/storage';

export default function AddBehaviorSheet() {
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { categories, addBehaviorEntry } = useData();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<BehaviorStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const childCategories = categories.filter((c) => c.childId === childId);

  const handleSubmit = async () => {
    if (!selectedCategory) {
      setError('Please select a category');
      return;
    }
    if (!selectedStatus) {
      setError('Please select a status');
      return;
    }
    if (!childId) {
      setError('No child selected');
      return;
    }

    setError('');
    setIsSubmitting(true);
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(
        selectedStatus === 'SMILEY'
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    }

    try {
      await addBehaviorEntry(childId, selectedCategory, selectedStatus);
      router.back();
    } catch {
      setError('Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Record Behavior</Text>
      <Text style={styles.subtitle}>Select a category and status</Text>

      <ScrollView style={styles.form} showsVerticalScrollIndicator={false}>
        {childCategories.length === 0 ? (
          <View style={styles.noCats}>
            <Ionicons name="folder-open-outline" size={32} color={Colors.textTertiary} />
            <Text style={styles.noCatsText}>No categories yet</Text>
            <Text style={styles.noCatsSubtext}>Add a category first from the child's profile</Text>
          </View>
        ) : (
          <>
            <Text style={styles.label}>Category</Text>
            <View style={styles.categoryList}>
              {childCategories.map((cat) => (
                <Pressable
                  key={cat.id}
                  onPress={() => setSelectedCategory(cat.id)}
                  style={[styles.categoryChip, selectedCategory === cat.id && styles.categoryChipActive]}
                >
                  <Text style={[styles.categoryText, selectedCategory === cat.id && styles.categoryTextActive]}>
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.label, { marginTop: 20 }]}>Status</Text>
            <View style={styles.statusRow}>
              <Pressable
                onPress={() => setSelectedStatus('SMILEY')}
                style={[
                  styles.statusBtn,
                  { borderColor: selectedStatus === 'SMILEY' ? Colors.smiley : Colors.border },
                  selectedStatus === 'SMILEY' && { backgroundColor: Colors.smileyBg },
                ]}
              >
                <Ionicons name="happy" size={36} color={selectedStatus === 'SMILEY' ? Colors.smiley : Colors.textTertiary} />
                <Text style={[styles.statusLabel, selectedStatus === 'SMILEY' && { color: Colors.smiley }]}>
                  Smiley (+1 pt)
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSelectedStatus('SAD')}
                style={[
                  styles.statusBtn,
                  { borderColor: selectedStatus === 'SAD' ? Colors.sad : Colors.border },
                  selectedStatus === 'SAD' && { backgroundColor: Colors.sadBg },
                ]}
              >
                <Ionicons name="sad" size={36} color={selectedStatus === 'SAD' ? Colors.sad : Colors.textTertiary} />
                <Text style={[styles.statusLabel, selectedStatus === 'SAD' && { color: Colors.sad }]}>
                  Sad (0 pts)
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {!!error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={14} color={Colors.error} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {childCategories.length > 0 && (
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
              <Text style={styles.submitBtnText}>Record Entry</Text>
            )}
          </Pressable>
        )}
      </ScrollView>
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
    marginBottom: 20,
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  categoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  categoryText: {
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: Colors.text,
  },
  categoryTextActive: {
    color: Colors.textInverse,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statusBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 2,
    gap: 8,
  },
  statusLabel: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
  noCats: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  noCatsText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  noCatsSubtext: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.errorBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 12,
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
    marginTop: 20,
  },
  submitBtnText: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.textInverse,
  },
});
