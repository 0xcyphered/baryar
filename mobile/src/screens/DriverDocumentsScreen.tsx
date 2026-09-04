import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { listDocuments, createDocument, deleteDocument, listVehicles } from '../services/driverApi';
import type { DriverDocument, Vehicle } from '../types';

const KIND_LABELS: Record<string, string> = {
  driving_license: 'گواهینامه رانندگی',
  vehicle_registration: 'سند وسیله نقلیه',
  safety_card: 'کارت معاینه فنی',
  national_id: 'کارت ملی',
  professional_card: 'کارت حرفه‌ای',
  other: 'سایر',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'در انتظار',
  approved: 'پذیرش‌شده',
  rejected: 'ردشده',
};

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
};

const KINDS = ['driving_license', 'vehicle_registration', 'safety_card', 'national_id', 'professional_card', 'other'];

export default function DriverDocumentsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [documents, setDocuments] = useState<DriverDocument[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [formKind, setFormKind] = useState('driving_license');
  const [formVehicleId, setFormVehicleId] = useState('');
  const [formStorageKey, setFormStorageKey] = useState('');
  const [formOriginalName, setFormOriginalName] = useState('');
  const [formMimeType, setFormMimeType] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [docs, vehs] = await Promise.all([listDocuments(), listVehicles()]);
      setDocuments(docs);
      setVehicles(vehs);
      setError(null);
    } catch {
      setError('خطا در بارگیری اسناد');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(() => { setLoading(true); loadData(); }); }, [loadData]);
  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  const handleAdd = async () => {
    setSubmitting(true);
    try {
      await createDocument({
        kind: formKind,
        vehicleId: formVehicleId || undefined,
        storageKey: formStorageKey || undefined,
        originalName: formOriginalName || undefined,
        mimeType: formMimeType || undefined,
      });
      setFormStorageKey('');
      setFormOriginalName('');
      setFormMimeType('');
      setShowForm(false);
      loadData();
    } catch {
      Alert.alert('خطا', 'ثبت سند با خطا مواجه شد');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (doc: DriverDocument) => {
    Alert.alert('حذف سند', 'آیا از حذف این سند مطمئن هستید؟', [
      { text: 'لغو', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteDocument(doc.id);
            loadData();
          } catch {
            Alert.alert('خطا', 'حذف سند با خطا مواجه شد');
          }
        },
      },
    ]);
  };

  // Group documents by kind
  const grouped = KINDS.reduce<Record<string, DriverDocument[]>>((acc, k) => {
    const items = documents.filter((d) => d.kind === k);
    if (items.length > 0) acc[k] = items;
    return acc;
  }, {});

  if (loading && !refreshing) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top + 16 }]}>
        <ActivityIndicator size="large" color={COLORS.blue} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>اسناد</Text>
        <View style={{ width: 24 }} />
      </View>

      <Pressable style={styles.addButton} onPress={() => setShowForm(!showForm)}>
        <Ionicons name={showForm ? 'close' : 'add'} size={18} color={COLORS.blue} />
        <Text style={styles.addButtonText}>{showForm ? 'لغو' : 'افزودن سند'}</Text>
      </Pressable>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.label}>نوع سند</Text>
          <View style={styles.pickerRow}>
            {KINDS.map((k) => (
              <Pressable
                key={k}
                style={[styles.pickerItem, formKind === k && styles.pickerItemActive]}
                onPress={() => setFormKind(k)}
              >
                <Text style={[styles.pickerText, formKind === k && styles.pickerTextActive]} numberOfLines={1}>
                  {KIND_LABELS[k]}
                </Text>
              </Pressable>
            ))}
          </View>

          {vehicles.length > 0 && (
            <>
              <Text style={styles.label}>وسیله مرتبط (اختیاری)</Text>
              <View style={styles.pickerRow}>
                <Pressable
                  style={[styles.pickerItem, !formVehicleId && styles.pickerItemActive]}
                  onPress={() => setFormVehicleId('')}
                >
                  <Text style={[styles.pickerText, !formVehicleId && styles.pickerTextActive]}>بدون وسیله</Text>
                </Pressable>
                {vehicles.map((v) => (
                  <Pressable
                    key={v.id}
                    style={[styles.pickerItem, formVehicleId === v.id && styles.pickerItemActive]}
                    onPress={() => setFormVehicleId(v.id)}
                  >
                    <Text style={[styles.pickerText, formVehicleId === v.id && styles.pickerTextActive]}>
                      {v.plate}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>کلید ذخیره‌سازی</Text>
          <TextInput
            style={styles.input}
            value={formStorageKey}
            onChangeText={setFormStorageKey}
            placeholder="اختیاری"
            placeholderTextColor={COLORS.gray}
          />

          <Text style={styles.label}>نام فایل</Text>
          <TextInput
            style={styles.input}
            value={formOriginalName}
            onChangeText={setFormOriginalName}
            placeholder="اختیاری"
            placeholderTextColor={COLORS.gray}
          />

          <Text style={styles.label}>نوع فایل</Text>
          <TextInput
            style={styles.input}
            value={formMimeType}
            onChangeText={setFormMimeType}
            placeholder="اختیاری — مثال: application/pdf"
            placeholderTextColor={COLORS.gray}
          />

          <Pressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleAdd}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buttonText}>ثبت سند</Text>}
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {documents.length === 0 && !error ? (
        <Text style={styles.emptyText}>هنوز سندی ثبت نشده</Text>
      ) : (
        Object.entries(grouped).map(([kind, docs]) => (
          <View key={kind}>
            <Text style={styles.sectionTitle}>{KIND_LABELS[kind]}</Text>
            {docs.map((doc) => (
              <View key={doc.id} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardRow}>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[doc.verificationStatus] || '#9ca3af' }]}>
                      <Text style={styles.statusBadgeText}>{STATUS_LABELS[doc.verificationStatus] || doc.verificationStatus}</Text>
                    </View>
                    {doc.originalName ? (
                      <Text style={styles.fileName}>{doc.originalName}</Text>
                    ) : null}
                  </View>
                  {doc.rejectionReason ? (
                    <Text style={styles.rejectionText}>{doc.rejectionReason}</Text>
                  ) : null}
                </View>
                {doc.verificationStatus === 'pending' && (
                  <Pressable onPress={() => handleDelete(doc)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.red} />
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    flex: 1,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: COLORS.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.blue,
  },
  form: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 14,
  },
  label: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    backgroundColor: COLORS.grayLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textDark,
    writingDirection: 'rtl',
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  pickerItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.grayLight,
  },
  pickerItemActive: { backgroundColor: COLORS.blue },
  pickerText: { fontSize: 11, fontFamily: 'Vazirmatn_500Medium', color: COLORS.textDark },
  pickerTextActive: { color: '#fff' },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 14, fontFamily: 'Vazirmatn_700Bold' },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontFamily: 'Vazirmatn_500Medium',
  },
  fileName: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textDark,
  },
  rejectionText: {
    fontSize: 11,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.red,
    marginTop: 4,
  },
  deleteBtn: { padding: 8 },
  errorText: {
    color: COLORS.red,
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    textAlign: 'center',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 40,
  },
});
