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
import { listVehicles, createVehicle, deleteVehicle } from '../services/driverApi';
import type { Vehicle } from '../types';

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  truck: 'کامیون',
  trailer: 'تریلر',
  van: 'ون',
  reefer: 'یخچالی',
  tanker: 'تانکر',
  other: 'سایر',
};

const VEHICLE_TYPES = ['truck', 'trailer', 'van', 'reefer', 'tanker', 'other'];

export default function DriverVehiclesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState('truck');
  const [formPlate, setFormPlate] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [formVolume, setFormVolume] = useState('');
  const [formYear, setFormYear] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await listVehicles();
      setVehicles(data);
      setError(null);
    } catch {
      setError('خطا در بارگیری وسایل نقلیه');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { setLoading(true); loadData(); }, [loadData]);
  const onRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  const handleAdd = async () => {
    if (!formPlate.trim()) {
      Alert.alert('خطا', 'شماره پلاک الزامی است');
      return;
    }
    setSubmitting(true);
    try {
      await createVehicle({
        vehicleType: formType,
        plate: formPlate.toUpperCase(),
        capacityWeightKg: formWeight ? Number(formWeight) : undefined,
        capacityVolumeM3: formVolume ? Number(formVolume) : undefined,
        year: formYear ? Number(formYear) : undefined,
      });
      setFormPlate('');
      setFormWeight('');
      setFormVolume('');
      setFormYear('');
      setShowForm(false);
      loadData();
    } catch (err: any) {
      Alert.alert('خطا', err?.error === 'duplicate_plate' ? 'این پلاک قبلاً ثبت شده' : 'ثبت وسیله با خطا مواجه شد');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (vehicle: Vehicle) => {
    Alert.alert('حذف وسیله', `آیا از حذف وسیله ${vehicle.plate} مطمئن هستید؟`, [
      { text: 'لغو', style: 'cancel' },
      {
        text: 'حذف',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVehicle(vehicle.id);
            loadData();
          } catch {
            Alert.alert('خطا', 'حذف وسیله با خطا مواجه شد');
          }
        },
      },
    ]);
  };

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
        <Text style={styles.headerTitle}>وسایل نقلیه</Text>
        <View style={{ width: 24 }} />
      </View>

      <Pressable style={styles.addButton} onPress={() => setShowForm(!showForm)}>
        <Ionicons name={showForm ? 'close' : 'add'} size={18} color={COLORS.blue} />
        <Text style={styles.addButtonText}>{showForm ? 'لغو' : 'افزودن وسیله'}</Text>
      </Pressable>

      {showForm && (
        <View style={styles.form}>
          <Text style={styles.label}>نوع وسیله</Text>
          <View style={styles.pickerRow}>
            {VEHICLE_TYPES.map((t) => (
              <Pressable
                key={t}
                style={[styles.pickerItem, formType === t && styles.pickerItemActive]}
                onPress={() => setFormType(t)}
              >
                <Text style={[styles.pickerText, formType === t && styles.pickerTextActive]}>
                  {VEHICLE_TYPE_LABELS[t]}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>شماره پلاک</Text>
          <TextInput
            style={styles.input}
            value={formPlate}
            onChangeText={(t) => setFormPlate(t.toUpperCase())}
            placeholder="مثال: ۱۲الف۳۴۵۶۷"
            placeholderTextColor={COLORS.gray}
          />

          <Text style={styles.label}>ظرفیت وزن (کیلوگرم)</Text>
          <TextInput
            style={styles.input}
            value={formWeight}
            onChangeText={setFormWeight}
            placeholder="اختیاری"
            placeholderTextColor={COLORS.gray}
            keyboardType="numeric"
          />

          <Text style={styles.label}>ظرفیت حجم (مترمکعب)</Text>
          <TextInput
            style={styles.input}
            value={formVolume}
            onChangeText={setFormVolume}
            placeholder="اختیاری"
            placeholderTextColor={COLORS.gray}
            keyboardType="numeric"
          />

          <Text style={styles.label}>سال ساخت</Text>
          <TextInput
            style={styles.input}
            value={formYear}
            onChangeText={setFormYear}
            placeholder="اختیاری"
            placeholderTextColor={COLORS.gray}
            keyboardType="numeric"
          />

          <Pressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={handleAdd}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buttonText}>ثبت وسیله</Text>}
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {vehicles.length === 0 && !error ? (
        <Text style={styles.emptyText}>هنوز وسیله‌ای ثبت نشده</Text>
      ) : (
        vehicles.map((v) => (
          <View key={v.id} style={styles.card}>
            <View style={{ flex: 1 }}>
              <View style={styles.cardRow}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{VEHICLE_TYPE_LABELS[v.vehicleType] || v.vehicleType}</Text>
                </View>
                <Text style={styles.plate}>{v.plate}</Text>
              </View>
              <Text style={styles.cardDetail}>
                {v.capacityWeightKg ? `${v.capacityWeightKg} کیلوگرم` : ''}
                {v.capacityWeightKg && v.capacityVolumeM3 ? ' · ' : ''}
                {v.capacityVolumeM3 ? `${v.capacityVolumeM3} مترمکعب` : ''}
                {v.year ? ` · ${v.year}` : ''}
              </Text>
            </View>
            <Pressable onPress={() => handleDelete(v)} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={18} color={COLORS.red} />
            </Pressable>
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
  pickerItemActive: {
    backgroundColor: COLORS.blue,
  },
  pickerText: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
  },
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  typeBadge: {
    backgroundColor: COLORS.blue,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeBadgeText: { color: '#fff', fontSize: 11, fontFamily: 'Vazirmatn_500Medium' },
  plate: { fontSize: 14, fontFamily: 'Vazirmatn_700Bold', color: COLORS.textDark },
  cardDetail: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
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
