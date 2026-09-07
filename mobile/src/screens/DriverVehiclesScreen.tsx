import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, font, radii, shadows, space } from '../theme';
import { hapticLight, hapticMedium } from '../utils/haptics';
import EmptyState from '../components/ui/EmptyState';
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

  useEffect(() => { queueMicrotask(() => { setLoading(true); loadData(); }); }, [loadData]);
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
    hapticMedium();
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
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', paddingTop: insets.top + space[4] }]}>
        <ActivityIndicator size="large" color={COLORS.blue} />
      </View>
    );
  }

  const renderItem = ({ item }: { item: Vehicle }) => (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <View style={styles.cardRow}>
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{VEHICLE_TYPE_LABELS[item.vehicleType] || item.vehicleType}</Text>
          </View>
          <Text style={styles.plate}>{item.plate}</Text>
        </View>
        <Text style={styles.cardDetail}>
          {item.capacityWeightKg ? `${item.capacityWeightKg} کیلوگرم` : ''}
          {item.capacityWeightKg && item.capacityVolumeM3 ? ' · ' : ''}
          {item.capacityVolumeM3 ? `${item.capacityVolumeM3} مترمکعب` : ''}
          {item.year ? ` · ${item.year}` : ''}
        </Text>
      </View>
      <Pressable onPress={() => handleDelete(item)} style={styles.deleteBtn}>
        <Ionicons name="trash-outline" size={18} color={COLORS.red} />
      </Pressable>
    </View>
  );

  const listHeader = (
    <>
      <View style={styles.header}>
        <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>وسایل نقلیه</Text>
        <View style={{ width: 24 }} />
      </View>

      <Pressable
        style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.85 }]}
        onPress={() => { hapticLight(); setShowForm(!showForm); }}
      >
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
                style={({ pressed }) => [
                  styles.pickerItem,
                  formType === t && styles.pickerItemActive,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => { hapticLight(); setFormType(t); }}
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
            style={({ pressed }) => [
              styles.button,
              pressed && { opacity: 0.9 },
              submitting && styles.buttonDisabled,
            ]}
            onPress={handleAdd}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.buttonText}>ثبت وسیله</Text>}
          </Pressable>
        </View>
      )}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </>
  );

  return (
    <FlatList
      data={vehicles}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        !error ? (
          <EmptyState
            icon="car-outline"
            title="هنوز وسیله‌ای ثبت نشده"
            message="وسیله نقلیه خود را ثبت کنید"
          />
        ) : null
      }
      contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }}
      onRefresh={onRefresh}
      refreshing={refreshing}
      style={styles.container}
    />
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
  pickerItemActive: {
    backgroundColor: COLORS.blue,
  },
  pickerText: {
    fontSize: 12,
    fontFamily: font.medium,
    color: COLORS.textDark,
  },
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: space[4],
    marginBottom: space[2],
    borderRadius: radii.lg,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    ...shadows.sm,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: space[1],
  },
  typeBadge: {
    backgroundColor: COLORS.blue,
    borderRadius: radii.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeBadgeText: { color: COLORS.white, fontSize: 11, fontFamily: font.medium },
  plate: { fontSize: 14, fontFamily: font.bold, color: COLORS.textDark },
  cardDetail: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.textMid,
  },
  deleteBtn: { padding: 8 },
  errorText: {
    color: COLORS.red,
    fontSize: 13,
    fontFamily: font.regular,
    textAlign: 'center',
    marginTop: space[5],
  },
});
