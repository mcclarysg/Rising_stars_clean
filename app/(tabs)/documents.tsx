import { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Modal, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { useData } from '@/contexts/DataContext';
import { useAuth } from '@/contexts/AuthContext';
import { type Document, type MedicalRecord, getDocCategory } from '@/lib/storage';
import { getApiUrl } from '@/lib/query-client';
import Colors from '@/constants/colors';

const DOC_CATEGORIES = [
  { key: 'results', label: 'Test Results', icon: 'flask-outline' as const, color: '#7c3aed', bg: '#f3e8ff' },
  { key: 'letters', label: 'Letters', icon: 'mail-outline' as const, color: '#0891b2', bg: '#e0f2fe' },
  { key: 'summary', label: 'Health Summary', icon: 'heart-outline' as const, color: '#059669', bg: '#d1fae5' },
] as const;

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { documents, children, medicalRecords, addDoc, removeDoc, analyzeDoc, analyzeMedicalRecord, refreshData } = useData();

  const isViewer = user?.role === 'VIEWER';
  const [refreshing, setRefreshing] = useState(false);
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [insightDoc, setInsightDoc] = useState<Document | null>(null);
  const [detailTab, setDetailTab] = useState<'view' | 'analyze'>('view');
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);
  const [recordDetailTab, setRecordDetailTab] = useState<'view' | 'analyze'>('view');
  const [analyzingRecord, setAnalyzingRecord] = useState<string | null>(null);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({});

  const webTopInset = Platform.OS === 'web' ? 67 : 0;

  const filteredDocs = selectedChild
    ? documents.filter((d) => d.childId === selectedChild)
    : documents;

  const sortedDocs = [...filteredDocs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const groupedDocs = useMemo(() => {
    const results: Document[] = [];
    const letters: Document[] = [];
    const summary: Document[] = [];
    for (const doc of sortedDocs) {
      const cat = getDocCategory(doc.fileName);
      if (cat === 'results') results.push(doc);
      else if (cat === 'letters') letters.push(doc);
      else summary.push(doc);
    }
    return { results, letters, summary };
  }, [sortedDocs]);

  const getChildName = (childId: string) => {
    const child = children.find((c) => c.id === childId);
    return child?.firstName || 'Unknown';
  };

  const getChild = (childId: string) => children.find((c) => c.id === childId);

  const pickFile = async (): Promise<{ uri: string; name: string; mimeType: string } | null> => {
    if (Platform.OS === 'web') {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '*/*';
        input.onchange = async () => {
          const file = input.files?.[0];
          if (!file) return resolve(null);
          const reader = new FileReader();
          reader.onload = () => resolve({
            uri: reader.result as string,
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
          });
          reader.readAsDataURL(file);
        };
        input.click();
      });
    } else {
      const DocumentPicker = await import('expo-document-picker');
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, base64: true });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const mimeType = asset.mimeType || 'application/octet-stream';
        const uri = (asset as any).base64
          ? `data:${mimeType};base64,${(asset as any).base64}`
          : asset.uri;
        return { uri, name: asset.name, mimeType };
      }
      return null;
    }
  };

  const handleUpload = async () => {
    if (children.length === 0) {
      if (Platform.OS === 'web') alert('Please add a child first.');
      return;
    }
    const childId = selectedChild || children[0]?.id;
    if (!childId) return;

    const file = await pickFile();
    if (!file) return;

    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await addDoc(childId, file.uri, file.name, file.mimeType);
  };

  const handleAnalyze = async (doc: Document) => {
    const isAnalyzable = doc.fileType?.startsWith('image') || doc.fileType === 'application/pdf';
    if (!isAnalyzable) {
      setDetailTab('analyze');
      setInsightDoc({ ...doc, aiInsights: '⚠️ AI analysis supports images and PDFs. Please upload a photo or PDF of the medical document.' });
      return;
    }

    setAnalyzing(doc.id);
    setDetailTab('analyze');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const child = getChild(doc.childId);
      const insights = await analyzeDoc(doc.id, child?.firstName || 'the child');
      setInsightDoc((prev) => prev && prev.id === doc.id ? { ...prev, aiInsights: insights } : { ...doc, aiInsights: insights });
    } catch (e: any) {
      const msg = `Unable to analyze this document: ${e?.message || 'Please try again.'}`;
      setInsightDoc((prev) => prev && prev.id === doc.id ? { ...prev, aiInsights: msg } : { ...doc, aiInsights: msg });
    } finally {
      setAnalyzing(null);
    }
  };

  const handleDelete = async (docId: string) => {
    if (Platform.OS === 'web') {
      if (!confirm('Remove this document?')) return;
      await removeDoc(docId);
      return;
    }
    const { Alert } = require('react-native');
    Alert.alert('Delete Document', 'Are you sure you want to remove this document?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await removeDoc(docId);
        },
      },
    ]);
  };

  const handleAnalyzeRecord = async (rec: MedicalRecord) => {
    setAnalyzingRecord(rec.id);
    setRecordDetailTab('analyze');
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const child = children.find((c) => c.id === rec.childId);
      const insights = await analyzeMedicalRecord(rec.id, child?.firstName || 'the child');
      setSelectedRecord((prev) => prev && prev.id === rec.id ? { ...prev, aiInsights: insights } : prev);
    } catch (e: any) {
      const msg = `Unable to analyze: ${e?.message || 'Please try again.'}`;
      setSelectedRecord((prev) => prev && prev.id === rec.id ? { ...prev, aiInsights: msg } : prev);
    } finally {
      setAnalyzingRecord(null);
    }
  };

  const openRecord = (rec: MedicalRecord) => {
    setSelectedRecord(rec);
    setRecordDetailTab('view');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  };

  if (isViewer) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 }]}>
        <View style={styles.lockedCard}>
          <View style={styles.lockedIconCircle}>
            <Ionicons name="lock-closed" size={36} color={Colors.primary} />
          </View>
          <Text style={styles.lockedTitle}>Medical Records</Text>
          <Text style={styles.lockedSubtitle}>
            Medical documents are only accessible to Sean and Nicole. Sign in as a parent to view this section.
          </Text>
        </View>
      </View>
    );
  }

  const baseUrl = getApiUrl().replace(/\/$/, '');

  const getThumbUri = (item: Document) => {
    if (item.thumbnailUrl) return `${baseUrl}${item.thumbnailUrl}`;
    if (item.fileUri) return item.fileUri;
    return null;
  };

  const openDocDetail = (doc: Document, tab: 'view' | 'analyze' = 'view') => {
    setDetailTab(tab);
    setInsightDoc(doc);
    if (tab === 'analyze' && !doc.aiInsights) {
      handleAnalyze(doc);
    }
  };

  const renderDocCard = (item: Document) => (
    <Pressable key={item.id} style={styles.docCard} onPress={() => openDocDetail(item, 'view')}>
      <View style={styles.docImageWrapper}>
        {item.fileType?.startsWith('image') ? (
          <Image
            source={{ uri: getThumbUri(item) || undefined }}
            style={styles.docImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            recyclingKey={item.id}
            transition={200}
            placeholder={{ blurhash: 'L6PZfSi_.AyE_3t7t7R**0o#DgR4' }}
          />
        ) : (
          <View style={styles.docPlaceholder}>
            <Ionicons name="document-text" size={32} color={Colors.primary} />
          </View>
        )}
      </View>
      <Pressable style={styles.deleteBtn} onPress={() => handleDelete(item.id)} hitSlop={8}>
        <Ionicons name="trash" size={13} color="#fff" />
      </Pressable>
      <View style={styles.docInfo}>
        <Text style={styles.docName} numberOfLines={2}>
          {item.fileName.replace(/\[FHIR:[^\]]+\]\s*/, '').replace(/\.(html|pdf)$/, '')}
        </Text>
        <View style={styles.docMeta}>
          <Text style={styles.docChild}>{getChildName(item.childId)}</Text>
          <Text style={styles.docDate}>{format(new Date(item.createdAt), 'MMM d')}</Text>
        </View>
        <View style={styles.docActions}>
          <Pressable
            style={({ pressed }) => [styles.docActionBtn, { backgroundColor: Colors.primary }, pressed && { opacity: 0.75 }]}
            onPress={() => openDocDetail(item, 'view')}
          >
            <Ionicons name="eye-outline" size={12} color="#fff" />
            <Text style={styles.analyzeBtnText}>View</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.docActionBtn, item.aiInsights ? styles.analyzeBtnDone : { backgroundColor: '#7c3aed' }, pressed && { opacity: 0.75 }]}
            onPress={() => openDocDetail(item, 'analyze')}
            disabled={analyzing === item.id}
          >
            {analyzing === item.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name={item.aiInsights ? 'checkmark-circle' : 'sparkles'} size={12} color="#fff" />
                <Text style={styles.analyzeBtnText}>{item.aiInsights ? 'Insights' : 'Analyze'}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Pressable>
  );

  const renderDocGrid = (docs: Document[]) => {
    if (docs.length === 0) return <Text style={styles.catEmpty}>None yet</Text>;
    const pairs: Document[][] = [];
    for (let i = 0; i < docs.length; i += 2) pairs.push(docs.slice(i, i + 2));
    return (
      <View style={styles.grid}>
        {pairs.map((pair, idx) => (
          <View key={idx} style={styles.gridRow}>
            {renderDocCard(pair[0])}
            {pair[1] ? renderDocCard(pair[1]) : <View style={styles.docCardPlaceholder} />}
          </View>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + webTopInset + 16,
          paddingBottom: insets.bottom + 100,
          paddingHorizontal: 16,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
      >
        {/* Header */}
        <View style={styles.headerSection}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.pageTitle}>Medical Docs</Text>
              <Text style={styles.pageSubtitle}>{sortedDocs.length} file{sortedDocs.length !== 1 ? 's' : ''}</Text>
            </View>
            <Pressable onPress={handleUpload} style={({ pressed }) => [styles.uploadBtn, pressed && { opacity: 0.8 }]}>
              <Ionicons name="camera" size={18} color={Colors.textInverse} />
            </Pressable>
          </View>
          <Text style={styles.uploadHint}>Upload photos of medical documents for AI analysis</Text>
          {children.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {[{ id: null, name: 'All' }, ...children.map((c) => ({ id: c.id, name: c.firstName }))].map((item) => (
                <Pressable
                  key={item.id || 'all'}
                  onPress={() => setSelectedChild(item.id)}
                  style={[styles.filterChip, (selectedChild === item.id || (!selectedChild && !item.id)) && styles.filterChipActive]}
                >
                  <Text style={[styles.filterText, (selectedChild === item.id || (!selectedChild && !item.id)) && styles.filterTextActive]}>
                    {item.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {sortedDocs.length > 0 && (
          DOC_CATEGORIES.map((cat) => {
            const docs = groupedDocs[cat.key];
            if (docs.length === 0) return null;
            return (
              <View key={cat.key} style={styles.catSection}>
                <View style={[styles.catHeader, { borderLeftColor: cat.color }]}>
                  <View style={[styles.catIconWrap, { backgroundColor: cat.bg }]}>
                    <Ionicons name={cat.icon} size={16} color={cat.color} />
                  </View>
                  <Text style={[styles.catTitle, { color: cat.color }]}>{cat.label}</Text>
                  <View style={[styles.catBadge, { backgroundColor: cat.color }]}>
                    <Text style={styles.catBadgeText}>{docs.length}</Text>
                  </View>
                </View>
                {renderDocGrid(docs)}
              </View>
            );
          })
        )}

        {/* Medical Records from FHIR / Test Data */}
        {(() => {
          const filteredRecords = selectedChild
            ? medicalRecords.filter((r) => r.childId === selectedChild)
            : medicalRecords;
          if (filteredRecords.length === 0 && sortedDocs.length === 0) {
            return (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={48} color={Colors.textTertiary} />
                <Text style={styles.emptyTitle}>No medical records yet</Text>
                <Text style={styles.emptySubtitle}>
                  Connect MyChart to sync records, or upload photos of documents for AI analysis
                </Text>
              </View>
            );
          }
          if (filteredRecords.length === 0) return null;

          const grouped: Record<string, MedicalRecord[]> = {};
          for (const rec of filteredRecords) {
            const cat = rec.category || 'Other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(rec);
          }

          const categoryConfig: Record<string, { icon: string; color: string; bg: string }> = {
            'Patient Info': { icon: 'person', color: '#059669', bg: '#d1fae5' },
            'Diagnostic Reports': { icon: 'flask', color: '#7c3aed', bg: '#f3e8ff' },
            'Lab Results': { icon: 'analytics', color: '#0891b2', bg: '#e0f2fe' },
            'Medications': { icon: 'medkit', color: '#dc2626', bg: '#fee2e2' },
            'Procedures': { icon: 'fitness', color: '#2563eb', bg: '#dbeafe' },
            'Goals': { icon: 'flag', color: '#D97706', bg: '#fef3c7' },
            'Other': { icon: 'document-text', color: '#6b7280', bg: '#f3f4f6' },
          };

          const categoryOrder = ['Patient Info', 'Medications', 'Lab Results', 'Diagnostic Reports', 'Procedures', 'Goals', 'Other'];
          const sortedCategories = Object.entries(grouped).sort(
            ([a], [b]) => (categoryOrder.indexOf(a) === -1 ? 99 : categoryOrder.indexOf(a)) - (categoryOrder.indexOf(b) === -1 ? 99 : categoryOrder.indexOf(b))
          );

          return (
            <View style={styles.medRecSection}>
              <View style={styles.medRecSectionHeader}>
                <Ionicons name="medical" size={18} color="#1565C0" />
                <Text style={styles.medRecSectionTitle}>Health Records</Text>
                <View style={styles.medRecBadge}>
                  <Text style={styles.medRecBadgeText}>{filteredRecords.length}</Text>
                </View>
              </View>

              {sortedCategories.map(([cat, records]) => {
                const config = categoryConfig[cat] || categoryConfig['Other'];
                const isExpanded = !!expandedCats[cat];
                const visibleRecords = isExpanded ? records : records.slice(0, 3);
                const hasMore = records.length > 3;
                return (
                  <View key={cat} style={styles.medRecCatCard}>
                    <Pressable
                      style={[styles.medRecCatHeader, { borderLeftColor: config.color }]}
                      onPress={() => setExpandedCats((prev) => ({ ...prev, [cat]: !prev[cat] }))}
                    >
                      <View style={[styles.medRecCatIcon, { backgroundColor: config.bg }]}>
                        <Ionicons name={config.icon as any} size={14} color={config.color} />
                      </View>
                      <Text style={[styles.medRecCatTitle, { color: config.color }]}>{cat}</Text>
                      <View style={[styles.catBadge, { backgroundColor: config.color }]}>
                        <Text style={styles.catBadgeText}>{records.length}</Text>
                      </View>
                      {hasMore && (
                        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={config.color} style={{ marginLeft: 4 }} />
                      )}
                    </Pressable>
                    {visibleRecords.map((rec) => {
                      const childName = children.find((c) => c.id === rec.childId)?.firstName;
                      return (
                        <Pressable
                          key={rec.id}
                          style={({ pressed }) => [styles.medRecRow, pressed && { backgroundColor: Colors.surfaceSecondary }]}
                          onPress={() => openRecord(rec)}
                        >
                          <View style={styles.medRecContent}>
                            <View style={styles.medRecNameRow}>
                              <Text style={styles.medRecName} numberOfLines={1}>{rec.displayName}</Text>
                              <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
                            </View>
                            <Text style={styles.medRecMeta}>
                              {rec.recordDate ? format(new Date(rec.recordDate), 'MMM d, yyyy') : ''}
                              {rec.status ? ` · ${rec.status}` : ''}
                              {childName ? ` · ${childName}` : ''}
                            </Text>
                            {rec.details?.value && (
                              <Text style={styles.medRecPreview} numberOfLines={1}>{rec.details.value}</Text>
                            )}
                            {rec.details?.dosage?.[0] && (
                              <Text style={styles.medRecPreview} numberOfLines={1}>{rec.details.dosage[0]}</Text>
                            )}
                            {rec.aiInsights && (
                              <View style={styles.medRecAnalyzedBadge}>
                                <Ionicons name="sparkles" size={10} color="#7c3aed" />
                                <Text style={styles.medRecAnalyzedText}>Analyzed</Text>
                              </View>
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                    {hasMore && !isExpanded && (
                      <Pressable
                        style={styles.medRecShowMore}
                        onPress={() => setExpandedCats((prev) => ({ ...prev, [cat]: true }))}
                      >
                        <Text style={[styles.medRecShowMoreText, { color: config.color }]}>Show all {records.length} records</Text>
                        <Ionicons name="chevron-down" size={14} color={config.color} />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })()}
      </ScrollView>

      <Modal
        visible={!!insightDoc}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInsightDoc(null)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {insightDoc?.fileName.replace(/\[FHIR:[^\]]+\]\s*/, '').replace(/\.(html|pdf)$/, '') || 'Document'}
              </Text>
              {insightDoc && (
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {getChildName(insightDoc.childId)} · {format(new Date(insightDoc.createdAt), 'MMM d, yyyy')}
                </Text>
              )}
            </View>
            <Pressable onPress={() => setInsightDoc(null)} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </Pressable>
          </View>

          <View style={styles.tabRow}>
            <Pressable
              style={[styles.tabBtn, detailTab === 'view' && styles.tabBtnActive]}
              onPress={() => setDetailTab('view')}
            >
              <Ionicons name="eye-outline" size={16} color={detailTab === 'view' ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.tabBtnText, detailTab === 'view' && styles.tabBtnTextActive]}>View</Text>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, detailTab === 'analyze' && styles.tabBtnActive]}
              onPress={() => {
                setDetailTab('analyze');
                if (insightDoc && !insightDoc.aiInsights && analyzing !== insightDoc.id) {
                  handleAnalyze(insightDoc);
                }
              }}
            >
              <Ionicons name="sparkles" size={16} color={detailTab === 'analyze' ? '#7c3aed' : Colors.textTertiary} />
              <Text style={[styles.tabBtnText, detailTab === 'analyze' && { color: '#7c3aed' }]}>Analyze</Text>
            </Pressable>
          </View>

          {detailTab === 'view' ? (
            <ScrollView
              style={styles.insightScroll}
              contentContainerStyle={styles.insightContent}
              showsVerticalScrollIndicator={false}
            >
              {insightDoc?.fileType?.startsWith('image') && insightDoc.fileUri ? (
                <Image
                  source={{ uri: insightDoc.fileUri }}
                  style={styles.docPreviewImage}
                  contentFit="contain"
                />
              ) : insightDoc?.fileUri ? (
                <View style={styles.docPreviewPlaceholder}>
                  <Ionicons name="document-text" size={56} color={Colors.primary} />
                  <Text style={styles.docPreviewType}>{insightDoc.fileType || 'Document'}</Text>
                  <Text style={styles.docPreviewHint}>
                    {insightDoc.fileType === 'application/pdf' ? 'PDF document — use Analyze tab for AI summary' : 'Document preview not available'}
                  </Text>
                </View>
              ) : (
                <View style={styles.docPreviewPlaceholder}>
                  <Ionicons name="cloud-offline-outline" size={56} color={Colors.textTertiary} />
                  <Text style={styles.docPreviewHint}>No document content available</Text>
                  <Text style={[styles.docPreviewHint, { marginTop: 4 }]}>Use Analyze tab for AI-powered summary</Text>
                </View>
              )}
              <View style={styles.docDetailMeta}>
                <View style={styles.docDetailRow}>
                  <Text style={styles.docDetailLabel}>Child</Text>
                  <Text style={styles.docDetailValue}>{insightDoc ? getChildName(insightDoc.childId) : ''}</Text>
                </View>
                <View style={styles.docDetailRow}>
                  <Text style={styles.docDetailLabel}>Type</Text>
                  <Text style={styles.docDetailValue}>{insightDoc?.fileType || 'Unknown'}</Text>
                </View>
                <View style={styles.docDetailRow}>
                  <Text style={styles.docDetailLabel}>Added</Text>
                  <Text style={styles.docDetailValue}>{insightDoc ? format(new Date(insightDoc.createdAt), 'MMMM d, yyyy') : ''}</Text>
                </View>
                <View style={styles.docDetailRow}>
                  <Text style={styles.docDetailLabel}>Source</Text>
                  <Text style={styles.docDetailValue}>{insightDoc?.uploadedBy === 'MyChart' ? 'VCU Health MyChart' : insightDoc?.uploadedBy || 'Manual Upload'}</Text>
                </View>
              </View>
            </ScrollView>
          ) : (
            <ScrollView
              style={styles.insightScroll}
              contentContainerStyle={styles.insightContent}
              showsVerticalScrollIndicator={false}
            >
              {analyzing === insightDoc?.id ? (
                <View style={styles.analyzingState}>
                  <ActivityIndicator size="large" color="#7c3aed" />
                  <Text style={styles.analyzingText}>Analyzing document...</Text>
                  <Text style={styles.analyzingHint}>AI is reading and summarizing key findings</Text>
                </View>
              ) : insightDoc?.aiInsights ? (
                <>
                  <View style={styles.insightBadge}>
                    <Ionicons name="sparkles" size={14} color="#7c3aed" />
                    <Text style={styles.insightBadgeText}>Powered by GPT-4</Text>
                  </View>
                  <Text style={styles.insightText}>{insightDoc.aiInsights}</Text>
                  <View style={styles.disclaimer}>
                    <Ionicons name="information-circle-outline" size={14} color={Colors.textTertiary} />
                    <Text style={styles.disclaimerText}>
                      AI-generated insights are for informational purposes only. Always consult your child's healthcare provider for medical advice.
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.reanalyzeBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => { if (insightDoc) handleAnalyze(insightDoc); }}
                  >
                    <Ionicons name="refresh" size={16} color={Colors.primary} />
                    <Text style={styles.reanalyzeBtnText}>Re-analyze</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.analyzingState}>
                  <Ionicons name="sparkles-outline" size={48} color={Colors.textTertiary} />
                  <Text style={styles.analyzingText}>No analysis yet</Text>
                  <Text style={styles.analyzingHint}>
                    {insightDoc?.fileType?.startsWith('image') || insightDoc?.fileType === 'application/pdf'
                      ? 'Tap below to generate an AI summary'
                      : 'AI analysis supports images and PDFs'}
                  </Text>
                  {(insightDoc?.fileType?.startsWith('image') || insightDoc?.fileType === 'application/pdf') && (
                    <Pressable
                      style={({ pressed }) => [styles.startAnalyzeBtn, pressed && { opacity: 0.8 }]}
                      onPress={() => { if (insightDoc) handleAnalyze(insightDoc); }}
                    >
                      <Ionicons name="sparkles" size={16} color="#fff" />
                      <Text style={styles.startAnalyzeBtnText}>Analyze Now</Text>
                    </Pressable>
                  )}
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      <Modal
        visible={!!selectedRecord}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedRecord(null)}
      >
        <View style={[styles.modalContainer, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selectedRecord?.displayName || 'Record'}
              </Text>
              {selectedRecord && (
                <Text style={styles.modalSubtitle} numberOfLines={1}>
                  {getChildName(selectedRecord.childId)}
                  {selectedRecord.recordDate ? ` · ${format(new Date(selectedRecord.recordDate), 'MMM d, yyyy')}` : ''}
                </Text>
              )}
            </View>
            <Pressable onPress={() => setSelectedRecord(null)} style={styles.closeBtn} hitSlop={8}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </Pressable>
          </View>

          <View style={styles.tabRow}>
            <Pressable
              style={[styles.tabBtn, recordDetailTab === 'view' && styles.tabBtnActive]}
              onPress={() => setRecordDetailTab('view')}
            >
              <Ionicons name="eye-outline" size={16} color={recordDetailTab === 'view' ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.tabBtnText, recordDetailTab === 'view' && styles.tabBtnTextActive]}>View</Text>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, recordDetailTab === 'analyze' && styles.tabBtnActive]}
              onPress={() => {
                setRecordDetailTab('analyze');
                if (selectedRecord && !selectedRecord.aiInsights && analyzingRecord !== selectedRecord.id) {
                  handleAnalyzeRecord(selectedRecord);
                }
              }}
            >
              <Ionicons name="sparkles" size={16} color={recordDetailTab === 'analyze' ? '#7c3aed' : Colors.textTertiary} />
              <Text style={[styles.tabBtnText, recordDetailTab === 'analyze' && { color: '#7c3aed' }]}>Analyze</Text>
            </Pressable>
          </View>

          {recordDetailTab === 'view' ? (
            <ScrollView
              style={styles.insightScroll}
              contentContainerStyle={styles.insightContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.recDetailCard}>
                <View style={styles.recDetailIconRow}>
                  <View style={[styles.recDetailTypeIcon, { backgroundColor: '#e0f2fe' }]}>
                    <Ionicons name="medical" size={24} color="#1565C0" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recDetailType}>{selectedRecord?.category || 'Record'}</Text>
                    <Text style={styles.recDetailResource}>{selectedRecord?.resourceType}</Text>
                  </View>
                  {selectedRecord?.status && (
                    <View style={[styles.recStatusBadge, selectedRecord.status.toLowerCase() === 'active' ? { backgroundColor: '#d1fae5' } : { backgroundColor: '#f3f4f6' }]}>
                      <Text style={[styles.recStatusText, selectedRecord.status.toLowerCase() === 'active' ? { color: '#059669' } : { color: '#6b7280' }]}>
                        {selectedRecord.status}
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.docDetailMeta}>
                <View style={styles.docDetailRow}>
                  <Text style={styles.docDetailLabel}>Child</Text>
                  <Text style={styles.docDetailValue}>{selectedRecord ? getChildName(selectedRecord.childId) : ''}</Text>
                </View>
                {selectedRecord?.recordDate && (
                  <View style={styles.docDetailRow}>
                    <Text style={styles.docDetailLabel}>Date</Text>
                    <Text style={styles.docDetailValue}>{format(new Date(selectedRecord.recordDate), 'MMMM d, yyyy')}</Text>
                  </View>
                )}
                <View style={styles.docDetailRow}>
                  <Text style={styles.docDetailLabel}>Type</Text>
                  <Text style={styles.docDetailValue}>{selectedRecord?.resourceType || 'Unknown'}</Text>
                </View>
                <View style={styles.docDetailRow}>
                  <Text style={styles.docDetailLabel}>Source</Text>
                  <Text style={styles.docDetailValue}>{selectedRecord?.fhirId ? 'VCU Health MyChart' : 'Test Data'}</Text>
                </View>
              </View>

              {selectedRecord?.details && (
                <View style={styles.recDetailsSection}>
                  <Text style={styles.recDetailsSectionTitle}>Details</Text>
                  {selectedRecord.details.value && (
                    <View style={styles.recDetailItem}>
                      <Ionicons name="analytics-outline" size={16} color={Colors.primary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Value</Text>
                        <Text style={styles.recDetailItemValue}>{selectedRecord.details.value}</Text>
                      </View>
                    </View>
                  )}
                  {selectedRecord.details.referenceRange?.[0] && (
                    <View style={styles.recDetailItem}>
                      <Ionicons name="swap-horizontal-outline" size={16} color={Colors.textTertiary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Reference Range</Text>
                        <Text style={styles.recDetailItemValue}>{selectedRecord.details.referenceRange[0]}</Text>
                      </View>
                    </View>
                  )}
                  {selectedRecord.details.interpretation?.[0] && (
                    <View style={styles.recDetailItem}>
                      <Ionicons name="flag-outline" size={16} color={selectedRecord.details.interpretation[0].toLowerCase().includes('normal') ? '#059669' : '#dc2626'} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Interpretation</Text>
                        <Text style={[styles.recDetailItemValue, { color: selectedRecord.details.interpretation[0].toLowerCase().includes('normal') ? '#059669' : '#dc2626' }]}>
                          {selectedRecord.details.interpretation[0]}
                        </Text>
                      </View>
                    </View>
                  )}
                  {selectedRecord.details.dosage?.map((d: string, i: number) => (
                    <View key={i} style={styles.recDetailItem}>
                      <Ionicons name="time-outline" size={16} color="#dc2626" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Dosage</Text>
                        <Text style={styles.recDetailItemValue}>{d}</Text>
                      </View>
                    </View>
                  ))}
                  {selectedRecord.details.prescriber && (
                    <View style={styles.recDetailItem}>
                      <Ionicons name="person-outline" size={16} color={Colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Prescriber</Text>
                        <Text style={styles.recDetailItemValue}>{selectedRecord.details.prescriber}</Text>
                      </View>
                    </View>
                  )}
                  {selectedRecord.details.conclusion && (
                    <View style={styles.recDetailItem}>
                      <Ionicons name="checkmark-circle-outline" size={16} color="#059669" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Conclusion</Text>
                        <Text style={styles.recDetailItemValue}>{selectedRecord.details.conclusion}</Text>
                      </View>
                    </View>
                  )}
                  {selectedRecord.details.performer && (
                    <View style={styles.recDetailItem}>
                      <Ionicons name="person-outline" size={16} color={Colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Performer</Text>
                        <Text style={styles.recDetailItemValue}>{selectedRecord.details.performer}</Text>
                      </View>
                    </View>
                  )}
                  {selectedRecord.details.outcome && (
                    <View style={styles.recDetailItem}>
                      <Ionicons name="ribbon-outline" size={16} color="#059669" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Outcome</Text>
                        <Text style={styles.recDetailItemValue}>{selectedRecord.details.outcome}</Text>
                      </View>
                    </View>
                  )}
                  {selectedRecord.details.target?.map((t: string, i: number) => (
                    <View key={i} style={styles.recDetailItem}>
                      <Ionicons name="flag-outline" size={16} color="#D97706" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Target</Text>
                        <Text style={styles.recDetailItemValue}>{t}</Text>
                      </View>
                    </View>
                  ))}
                  {selectedRecord.details.birthDate && (
                    <View style={styles.recDetailItem}>
                      <Ionicons name="calendar-outline" size={16} color={Colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Date of Birth</Text>
                        <Text style={styles.recDetailItemValue}>{format(new Date(selectedRecord.details.birthDate), 'MMMM d, yyyy')}</Text>
                      </View>
                    </View>
                  )}
                  {selectedRecord.details.gender && (
                    <View style={styles.recDetailItem}>
                      <Ionicons name="male-female-outline" size={16} color={Colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Gender</Text>
                        <Text style={styles.recDetailItemValue}>{selectedRecord.details.gender}</Text>
                      </View>
                    </View>
                  )}
                  {selectedRecord.details.address && (
                    <View style={styles.recDetailItem}>
                      <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Address</Text>
                        <Text style={styles.recDetailItemValue}>{selectedRecord.details.address}</Text>
                      </View>
                    </View>
                  )}
                  {selectedRecord.details.phone && (
                    <View style={styles.recDetailItem}>
                      <Ionicons name="call-outline" size={16} color={Colors.textSecondary} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recDetailItemLabel}>Phone</Text>
                        <Text style={styles.recDetailItemValue}>{selectedRecord.details.phone}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          ) : (
            <ScrollView
              style={styles.insightScroll}
              contentContainerStyle={styles.insightContent}
              showsVerticalScrollIndicator={false}
            >
              {analyzingRecord === selectedRecord?.id ? (
                <View style={styles.analyzingState}>
                  <ActivityIndicator size="large" color="#7c3aed" />
                  <Text style={styles.analyzingText}>Analyzing record...</Text>
                  <Text style={styles.analyzingHint}>AI is reviewing this health record</Text>
                </View>
              ) : selectedRecord?.aiInsights ? (
                <>
                  <View style={styles.insightBadge}>
                    <Ionicons name="sparkles" size={14} color="#7c3aed" />
                    <Text style={styles.insightBadgeText}>Powered by GPT-4</Text>
                  </View>
                  <Text style={styles.insightText}>{selectedRecord.aiInsights}</Text>
                  <View style={styles.disclaimer}>
                    <Ionicons name="information-circle-outline" size={14} color={Colors.textTertiary} />
                    <Text style={styles.disclaimerText}>
                      AI-generated insights are for informational purposes only. Always consult your child's healthcare provider for medical advice.
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.reanalyzeBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => { if (selectedRecord) handleAnalyzeRecord(selectedRecord); }}
                  >
                    <Ionicons name="refresh" size={16} color={Colors.primary} />
                    <Text style={styles.reanalyzeBtnText}>Re-analyze</Text>
                  </Pressable>
                </>
              ) : (
                <View style={styles.analyzingState}>
                  <Ionicons name="sparkles-outline" size={48} color={Colors.textTertiary} />
                  <Text style={styles.analyzingText}>No analysis yet</Text>
                  <Text style={styles.analyzingHint}>Tap below to generate an AI summary of this record</Text>
                  <Pressable
                    style={({ pressed }) => [styles.startAnalyzeBtn, pressed && { opacity: 0.8 }]}
                    onPress={() => { if (selectedRecord) handleAnalyzeRecord(selectedRecord); }}
                  >
                    <Ionicons name="sparkles" size={16} color="#fff" />
                    <Text style={styles.startAnalyzeBtnText}>Analyze Now</Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerSection: { marginBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', color: Colors.text },
  pageSubtitle: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 4 },
  uploadHint: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textTertiary, marginTop: 6 },
  uploadBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  filterRow: { paddingTop: 14, gap: 8 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterText: { fontSize: 14, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  filterTextActive: { color: Colors.textInverse },
  columnWrapper: { gap: 12, marginBottom: 12 },
  docCard: {
    flex: 1, backgroundColor: Colors.surface,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.borderLight,
  },
  docImageWrapper: { borderTopLeftRadius: 13, borderTopRightRadius: 13, overflow: 'hidden' },
  deleteBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(220,38,38,0.9)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10, elevation: 4,
  },
  docImage: { width: '100%', height: 110 },
  docPlaceholder: {
    width: '100%', height: 110,
    backgroundColor: Colors.surfaceSecondary,
    alignItems: 'center', justifyContent: 'center',
  },
  docInfo: { padding: 10 },
  docName: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginBottom: 4 },
  docMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  docChild: { fontSize: 11, fontFamily: 'Inter_500Medium', color: Colors.primary },
  docDate: { fontSize: 11, fontFamily: 'Inter_400Regular', color: Colors.textTertiary },
  docActions: {
    flexDirection: 'row', gap: 6,
  },
  docActionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 6, borderRadius: 8,
  },
  analyzeBtnDone: { backgroundColor: '#059669' },
  analyzeBtnText: { fontSize: 11, fontFamily: 'Inter_600SemiBold', color: '#fff' },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginTop: 16 },
  emptySubtitle: {
    fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary,
    textAlign: 'center', marginTop: 6, maxWidth: 280,
  },
  catSection: { marginBottom: 24 },
  catHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderLeftWidth: 3, paddingLeft: 10, marginBottom: 12,
  },
  catIconWrap: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  catTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', flex: 1 },
  catBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  catBadgeText: { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#fff' },
  catEmpty: {
    fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textTertiary,
    paddingLeft: 10, paddingBottom: 8,
  },
  grid: { gap: 12 },
  gridRow: { flexDirection: 'row', gap: 12 },
  docCardPlaceholder: { flex: 1 },
  modalContainer: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', color: Colors.text },
  modalSubtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 2 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  insightScroll: { flex: 1 },
  insightContent: { paddingBottom: 20 },
  insightBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#f3e8ff', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    alignSelf: 'flex-start', marginBottom: 16,
  },
  insightBadgeText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#7c3aed' },
  insightText: { fontSize: 15, fontFamily: 'Inter_400Regular', color: Colors.text, lineHeight: 24 },
  disclaimer: {
    flexDirection: 'row', gap: 6, marginTop: 20,
    backgroundColor: Colors.surface, borderRadius: 10,
    padding: 12, alignItems: 'flex-start',
  },
  disclaimerText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textTertiary, flex: 1, lineHeight: 18 },
  tabRow: {
    flexDirection: 'row', gap: 0, marginBottom: 16,
    backgroundColor: Colors.surface, borderRadius: 12,
    padding: 4, borderWidth: 1, borderColor: Colors.borderLight,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
  },
  tabBtnActive: {
    backgroundColor: Colors.background,
    elevation: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3,
  },
  tabBtnText: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.textTertiary },
  tabBtnTextActive: { color: Colors.primary },
  docPreviewImage: { width: '100%', height: 350, borderRadius: 12, backgroundColor: Colors.surface },
  docPreviewPlaceholder: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 60, backgroundColor: Colors.surface,
    borderRadius: 12, borderWidth: 1, borderColor: Colors.borderLight,
  },
  docPreviewType: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginTop: 12 },
  docPreviewHint: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textTertiary, marginTop: 4, textAlign: 'center', paddingHorizontal: 32 },
  docDetailMeta: {
    marginTop: 20, backgroundColor: Colors.surface, borderRadius: 12,
    padding: 16, borderWidth: 1, borderColor: Colors.borderLight,
  },
  docDetailRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: Colors.borderLight,
  },
  docDetailLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', color: Colors.textSecondary },
  docDetailValue: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: Colors.text, maxWidth: '60%' as any, textAlign: 'right' as const },
  analyzingState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  analyzingText: { fontSize: 17, fontFamily: 'Inter_600SemiBold', color: Colors.text, marginTop: 16 },
  analyzingHint: { fontSize: 14, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, marginTop: 6, textAlign: 'center' as const },
  startAnalyzeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#7c3aed', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 14, marginTop: 20,
  },
  startAnalyzeBtnText: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#fff' },
  reanalyzeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.primary, marginTop: 12,
  },
  reanalyzeBtnText: { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: Colors.primary },
  lockedCard: {
    backgroundColor: Colors.surface,
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    elevation: 3,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    width: '100%',
  },
  lockedIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  lockedTitle: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    textAlign: 'center',
  },
  lockedSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  medRecSection: {
    marginTop: 24,
  },
  medRecSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  medRecSectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    flex: 1,
  },
  medRecBadge: {
    backgroundColor: '#1565C0',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  medRecBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: '#fff',
  },
  medRecCatCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    overflow: 'hidden',
  },
  medRecCatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderLeftWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  medRecCatIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medRecCatTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    flex: 1,
  },
  medRecRow: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  medRecContent: {
    gap: 3,
  },
  medRecName: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.text,
  },
  medRecMeta: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
  },
  medRecDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  medRecDetailText: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: Colors.text,
    flex: 1,
  },
  medRecRefText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    flex: 1,
  },
  medRecInterpBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 4,
  },
  medRecInterpText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  medRecPatientInfo: {
    marginTop: 4,
    gap: 2,
  },
  medRecNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  medRecPreview: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.primary,
    marginTop: 3,
  },
  medRecAnalyzedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: '#f3e8ff',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  medRecAnalyzedText: {
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    color: '#7c3aed',
  },
  medRecShowMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  medRecShowMoreText: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  recDetailCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  recDetailIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recDetailTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recDetailType: {
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
  },
  recDetailResource: {
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  recStatusBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  recStatusText: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  recDetailsSection: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 14,
  },
  recDetailsSectionTitle: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.text,
    marginBottom: 2,
  },
  recDetailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  recDetailItemLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  recDetailItemValue: {
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    color: Colors.text,
    marginTop: 1,
  },
});
