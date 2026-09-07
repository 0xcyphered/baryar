import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
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
import { COLORS, font, radii, shadows, space } from '../theme';
import { hapticLight, hapticSuccess, hapticWarning } from '../utils/haptics';
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
      hapticWarning();
      Alert.alert('خطا', 'لطفاً وسیله نقلیه را انتخاب کنید');
      return;
    }
    const price = Number(priceRial);
    if (!price || price <= 0) {
      hapticWarning();
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
      hapticSuccess();
      Alert.alert('موفق', 'پیشنهاد شما ثبت شد', [
        { text: 'باشه', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      hapticWarning();
      Alert.alert('خطا', err?.error === 'duplicate_offer' ? 'شما قبلاً برای این بار پیشنهاد داده‌اید' : 'ثبت پیشنهاد با خطا مواجه شد');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] }}
        keyboardShouldPersistTaps="handled"
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
                  style={({ pressed }) => [
                    styles.pickerItem,
                    selectedVehicleId === v.id && styles.pickerItemActive,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => { hapticLight(); setSelectedVehicleId(v.id); }}
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
            style={({ pressed }) => [
              styles.button,
              pressed && { opacity: 0.9 },
              submitting && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.buttonText}>ارسال پیشنهاد</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  cargoCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: space[4],
    marginBottom: space[4],
    borderRadius: radii.lg,
    padding: space[4],
    ...shadows.sm,
  },
  cargoTitle: {
    fontSize: 15,
    fontFamily: font.bold,
    color: COLORS.textDark,
  },
  form: {
    paddingHorizontal: space[4],
  },
  label: {
    fontSize: 13,
    fontFamily: font.medium,
    color: COLORS.textDark,
    marginBottom: 6,
    marginTop: space[2],
  },
  hint: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.red,
    marginBottom: 8,
  },
  input: {
    backgroundColor: COLORS.white,
    borderRadius: radii.md,
    paddingHorizontal: space[4],
    paddingVertical: 12,
    fontSize: 14,
    fontFamily: font.regular,
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
    borderRadius: radii.sm,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.grayLight,
  },
  pickerItemActive: { borderColor: COLORS.blue, backgroundColor: COLORS.blueTint },
  pickerText: { fontSize: 13, fontFamily: font.medium, color: COLORS.textDark },
  pickerTextActive: { color: COLORS.blue },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: radii.md,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: space[4],
    ...shadows.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: COLORS.white, fontSize: 15, fontFamily: font.bold },
});
