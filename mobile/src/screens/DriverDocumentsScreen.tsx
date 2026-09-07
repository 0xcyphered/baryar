import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { COLORS, font, radii, shadows, space } from '../theme';
import { hapticLight, hapticWarning } from '../utils/haptics';
import EmptyState from '../components/ui/EmptyState';
import { listDocuments, uploadDocument, deleteDocument, listVehicles } from '../services/driverApi';
import { getAuthToken } from '../services/apiClient';
import { API_BASE } from '../config';
import type { DriverDocument, Vehicle } from '../types';
import { KIND_LABELS, DOC_STATUS_LABELS, DOC_STATUS_COLORS } from '../utils/constants';

const KINDS = ['driving_license', 'vehicle_registration', 'safety_card', 'national_id', 'professional_card', 'other'];

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

interface PickedFile {
  uri: string;
  name: string;
  mimeType: string;
}

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
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<string | null>(null);

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

  const pickFile = async () => {
    hapticLight();
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ALLOWED_MIME_TYPES,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const asset = result.assets[0];
      setPickedFile({
        uri: asset.uri,
        name: asset.name || 'document',
        mimeType: asset.mimeType || 'application/octet-stream',
      });
    } catch {
      Alert.alert('خطا', 'انتخاب فایل با خطا مواجه شد');
    }
  };

  const handleAdd = async () => {
    if (!pickedFile) {
      hapticWarning();
      Alert.alert('خطا', 'ابتدا فایل سند را انتخاب کنید');
      return;
    }
    setSubmitting(true);
    try {
      await uploadDocument({
        kind: formKind,
        vehicleId: formVehicleId || null,
        uri: pickedFile.uri,
        name: pickedFile.name,
        mimeType: pickedFile.mimeType,
      });
      setPickedFile(null);
      setShowForm(false);
      loadData();
    } catch (err: any) {
      hapticWarning();
      if (err && err.error === 'invalid_file_type') {
        Alert.alert('خطا', 'فرمت فایل مجاز نیست (فقط jpg، png، webp و pdf)');
      } else if (err && err.error === 'file_too_large') {
        Alert.alert('خطا', 'حجم فایل بیش از ۵ مگابایت است');
      } else if (err && err.error === 'validation_error') {
        Alert.alert('خطا', 'اطلاعات سند کامل نیست');
      } else {
        Alert.alert('خطا', 'ثبت سند با خطا مواجه شد');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const openDocument = async (doc: DriverDocument) => {
    hapticLight();
    setViewingDoc(doc.id);
    try {
      const token = await getAuthToken();
      const fileUri = (FileSystem.cacheDirectory || '') + `doc-${doc.id}`;
      await FileSystem.downloadAsync(
        `${API_BASE}/api/driver/documents/${doc.id}/file`,
        fileUri,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: doc.mimeType || 'application/octet-stream',
        });
      } else {
        Alert.alert('خطا', 'اشتراک‌گذاری فایل در این دستگاه پشتیبانی نمی‌شود');
      }
    } catch {
      Alert.alert('خطا', 'فایلی برای این سند موجود نیست');
    } finally {
      setViewingDoc(null);
    }
  };

  const handleDelete = (doc: DriverDocument) => {
    hapticWarning();
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
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top + space[4] }]}>
        <ActivityIndicator size="large" color={COLORS.blue} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>اسناد</Text>
        <View style={{ width: 24 }} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.85 }]}
        onPress={() => { hapticLight(); setShowForm(!showForm); }}
      >
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
                style={({ pressed }) => [
                  styles.pickerItem,
                  formKind === k && styles.pickerItemActive,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => { hapticLight(); setFormKind(k); }}
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
                  style={({ pressed }) => [
                    styles.pickerItem,
                    !formVehicleId && styles.pickerItemActive,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => { hapticLight(); setFormVehicleId(''); }}
                >
                  <Text style={[styles.pickerText, !formVehicleId && styles.pickerTextActive]}>بدون وسیله</Text>
                </Pressable>
                {vehicles.map((v) => (
                  <Pressable
                    key={v.id}
                    style={({ pressed }) => [
                      styles.pickerItem,
                      formVehicleId === v.id && styles.pickerItemActive,
                      pressed && { opacity: 0.8 },
                    ]}
                    onPress={() => { hapticLight(); setFormVehicleId(v.id); }}
                  >
                    <Text style={[styles.pickerText, formVehicleId === v.id && styles.pickerTextActive]}>
                      {v.plate}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>فایل سند</Text>
          <Pressable style={styles.pickButton} onPress={pickFile}>
            <Ionicons name="document-attach-outline" size={18} color={COLORS.blue} />
            <Text style={styles.pickButtonText} numberOfLines={1}>
              {pickedFile ? pickedFile.name : 'انتخاب فایل (jpg، png، webp، pdf)'}
            </Text>
          </Pressable>
          <Text style={styles.hintText}>حداکثر حجم: ۵ مگابایت</Text>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && { opacity: 0.9 },
              (submitting || !pickedFile) && styles.buttonDisabled,
            ]}
            onPress={handleAdd}
            disabled={submitting || !pickedFile}
          >
            {submitting ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.buttonText}>ثبت سند</Text>}
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {documents.length === 0 && !error ? (
        <EmptyState
          icon="document-text-outline"
          title="هنوز سندی ثبت نشده"
          message="اسناد مورد نیاز خود را بارگذاری کنید"
        />
      ) : (
        Object.entries(grouped).map(([kind, docs]) => (
          <View key={kind}>
            <Text style={styles.sectionTitle}>{KIND_LABELS[kind]}</Text>
            {docs.map((doc) => (
              <View key={doc.id} style={styles.card}>
                <View style={{ flex: 1 }}>
                  <View style={styles.cardRow}>
                    <View style={[styles.statusBadge, { backgroundColor: DOC_STATUS_COLORS[doc.verificationStatus] || COLORS.gray }]}>
                      <Text style={styles.statusBadgeText}>{DOC_STATUS_LABELS[doc.verificationStatus] || doc.verificationStatus}</Text>
                    </View>
                    {doc.originalName ? (
                      <Text style={styles.fileName}>{doc.originalName}</Text>
                    ) : null}
                  </View>
                  {doc.rejectionReason ? (
                    <Text style={styles.rejectionText}>{doc.rejectionReason}</Text>
                  ) : null}
                </View>
                <Pressable onPress={() => openDocument(doc)} style={styles.viewBtn} disabled={viewingDoc === doc.id}>
                  {viewingDoc === doc.id ? (
                    <ActivityIndicator size="small" color={COLORS.blue} />
                  ) : (
                    <Ionicons name="eye-outline" size={18} color={COLORS.blue} />
                  )}
                </Pressable>
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
    paddingHorizontal: space[4],
    marginBottom: space[4],
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: font.bold,
    color: COLORS.textDark,
    flex: 1,
    textAlign: 'center',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: space[4],
    marginBottom: space[3],
    backgroundColor: COLORS.white,
    borderRadius: radii.md,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    ...shadows.xs,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: font.medium,
    color: COLORS.blue,
  },
  form: {
    marginHorizontal: space[4],
    marginBottom: space[4],
    backgroundColor: COLORS.white,
    borderRadius: radii.lg,
    padding: space[4],
    ...shadows.sm,
  },
  label: {
    fontSize: 12,
    fontFamily: font.medium,
    color: COLORS.textDark,
    marginBottom: space[1],
    marginTop: space[2],
  },
  input: {
    backgroundColor: COLORS.grayLight,
    borderRadius: radii.sm,
    paddingHorizontal: space[3],
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: font.regular,
    color: COLORS.textDark,
    writingDirection: 'rtl',
  },
  pickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.grayLight,
    borderRadius: radii.sm,
    paddingHorizontal: space[3],
    paddingVertical: 12,
  },
  pickButtonText: {
    flex: 1,
    fontSize: 13,
    fontFamily: font.regular,
    color: COLORS.textDark,
  },
  hintText: {
    fontSize: 11,
    fontFamily: font.regular,
    color: COLORS.gray,
    marginTop: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: space[1],
  },
  pickerItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: COLORS.grayLight,
  },
  pickerItemActive: { backgroundColor: COLORS.blue },
  pickerText: { fontSize: 11, fontFamily: font.medium, color: COLORS.textDark },
  pickerTextActive: { color: COLORS.white },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: radii.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: space[3],
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: COLORS.white, fontSize: 14, fontFamily: font.bold },
  sectionTitle: {
    fontSize: 14,
    fontFamily: font.bold,
    color: COLORS.textDark,
    marginHorizontal: space[4],
    marginTop: space[4],
    marginBottom: space[2],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: space[4],
    marginBottom: space[2],
    borderRadius: radii.md,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    ...shadows.sm,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  statusBadgeText: {
    color: COLORS.white,
    fontSize: 11,
    fontFamily: font.medium,
  },
  fileName: {
    fontSize: 13,
    fontFamily: font.regular,
    color: COLORS.textDark,
  },
  rejectionText: {
    fontSize: 11,
    fontFamily: font.regular,
    color: COLORS.red,
    marginTop: 4,
  },
  viewBtn: { padding: 8 },
  deleteBtn: { padding: 8 },
  errorText: {
    color: COLORS.red,
    fontSize: 13,
    fontFamily: font.regular,
    textAlign: 'center',
    marginTop: space[5],
  },
});
