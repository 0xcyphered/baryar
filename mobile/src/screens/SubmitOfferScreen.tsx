import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { createOffer } from '../services/matchingApi';
import { listVehicles } from '../services/driverApi';
import type { Vehicle } from '../types';

export default function SubmitOfferScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params || {}) as { cargoId?: string; cargoTitle?: string };
  const cargoId = params.cargoId || '';
  const cargoTitle = params.cargoTitle || '';

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [priceRial, setPriceRial] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadVehicles = useCallback(async () => {
    try {
      const data = await listVehicles();
      setVehicles(data);
      if (data.length === 1) setSelectedVehicleId(data[0].id);
    } catch {
      // silently fail — user can try again
    }
  }, []);

  useEffect(() => { queueMicrotask(loadVehicles); }, [loadVehicles]);

  const handleSubmit = async () => {
    if (!selectedVehicleId) {
      Alert.alert('خطا', 'لطفاً وسیله نقلیه را انتخاب کنید');
      return;
    }
    const price = Number(priceRial);
    if (!price || price <= 0) {
      Alert.alert('خطا', 'لطفاً قیمت صحیح وارد کنید');
      return;
    }
    setSubmitting(true);
    try {
      await createOffer({
        cargoId,
        vehicleId: selectedVehicleId,
        priceRial: price,
        note: note || undefined,
      });
      Alert.alert('موفق', 'پیشنهاد شما ثبت شد', [
        { text: 'باشه', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      Alert.alert('خطا', err?.error === 'duplicate_offer' ? 'شما قبلاً برای این بار پیشنهاد داده‌اید' : 'ثبت پیشنهاد با خطا مواجه شد');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}
    >
      <View style={styles.header}>
        <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} onPress={() => navigation.goBack()} />
        <Text style={styles.headerTitle}>ثبت پیشنهاد</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Cargo info */}
      <View style={styles.cargoCard}>
        <Text style={styles.cargoTitle} numberOfLines={2}>{cargoTitle || 'بار'}</Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        <Text style={styles.label}>وسیله نقلیه</Text>
        {vehicles.length === 0 ? (
          <Text style={styles.hint}>ابتدا یک وسیله نقلیه ثبت کنید</Text>
        ) : (
          <View style={styles.pickerRow}>
            {vehicles.map((v) => (
              <Pressable
                key={v.id}
                style={[styles.pickerItem, selectedVehicleId === v.id && styles.pickerItemActive]}
                onPress={() => setSelectedVehicleId(v.id)}
              >
                <Text style={[styles.pickerText, selectedVehicleId === v.id && styles.pickerTextActive]}>
                  {v.plate}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={styles.label}>قیمت پیشنهادی (ریال)</Text>
        <TextInput
          style={styles.input}
          value={priceRial}
          onChangeText={setPriceRial}
          placeholder="قیمت پیشنهادی (ریال)"
          placeholderTextColor={COLORS.gray}
          keyboardType="numeric"
        />

        <Text style={styles.label}>یادداشت</Text>
        <TextInput
          style={styles.input}
          value={note}
          onChangeText={setNote}
          placeholder="یادداشت (اختیاری)"
          placeholderTextColor={COLORS.gray}
        />

        <Pressable
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.buttonText}>ارسال پیشنهاد</Text>
          )}
        </Pressable>
      </View>
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
  cargoCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 14,
  },
  cargoTitle: {
    fontSize: 15,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
  },
  form: {
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    marginBottom: 6,
    marginTop: 8,
  },
  hint: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.red,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textDark,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
    marginBottom: 8,
    writingDirection: 'rtl',
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  pickerItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
  },
  pickerItemActive: { borderColor: COLORS.blue, backgroundColor: '#eff6ff' },
  pickerText: { fontSize: 13, fontFamily: 'Vazirmatn_500Medium', color: COLORS.textDark },
  pickerTextActive: { color: COLORS.blue },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 15, fontFamily: 'Vazirmatn_700Bold' },
});
