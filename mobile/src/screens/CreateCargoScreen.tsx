import React, { useCallback, useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, font, radii, shadows, space, textStyles } from '../theme';
import { createCargo, publishCargo } from '../services/cargoApi';
import { registerLocationCallback } from './LocationPickerScreen';
import { MODE_LABELS, SPECIAL_LABELS, CARGO_ERROR_COPY } from '../utils/constants';
import { hapticLight, hapticMedium } from '../utils/haptics';

const TRANSPORT_MODES = ['land', 'sea', 'air', 'rail', 'multimodal'] as const;
const SPECIALS = ['hazardous', 'fragile', 'refrigerated', 'livestock', 'oversized', 'other'] as const;

/** Visual sections for the step indicator */
const SECTIONS = ['مبدأ و مقصد', 'مشخصات بار', 'ویژگی‌ها و تاریخ'] as const;

export default function CreateCargoScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [destination, setDestination] = useState<{ lat: number; lng: number } | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [transportMode, setTransportMode] = useState<string>('land');
  const [dimensions, setDimensions] = useState({
    weightKg: '', volumeM3: '', lengthCm: '', widthCm: '', heightCm: '',
  });
  const [specials, setSpecials] = useState<string[]>([]);
  const [pickupAt, setPickupAt] = useState('');
  const [deliverBy, setDeliverBy] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Current section (determines visual highlight in the step indicator)
  const currentSection =
    !origin || !destination ? 0 :
    dimensions.weightKg === '' ? 1 : 2;

  const pickLocation = useCallback(
    (mode: 'origin' | 'destination') => {
      hapticLight();
      const key = `create_${mode}`;
      registerLocationCallback(key, (lat, lng) => {
        if (mode === 'origin') setOrigin({ lat, lng });
        else setDestination({ lat, lng });
      });
      navigation.navigate('LocationPicker' as never, { mode } as never);
    },
    [navigation],
  );

  const toggleSpecial = (s: string) => {
    hapticLight();
    setSpecials((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const handleSubmit = async () => {
    if (!origin || !destination) {
      setError('مبدأ و مقصد را انتخاب کنید');
      return;
    }
    hapticMedium();
    setLoading(true);
    setError(null);
    try {
      const created = await createCargo({
        title: title || undefined,
        description: description || undefined,
        transportMode,
        origin: { address: '', location: { type: 'Point', coordinates: [origin.lng, origin.lat] } },
        destination: { address: '', location: { type: 'Point', coordinates: [destination.lng, destination.lat] } },
        dimensions: {
          weightKg: Number(dimensions.weightKg) || 0,
          volumeM3: Number(dimensions.volumeM3) || 0,
          lengthCm: Number(dimensions.lengthCm) || 0,
          widthCm: Number(dimensions.widthCm) || 0,
          heightCm: Number(dimensions.heightCm) || 0,
        },
        specialCharacteristics: specials.length > 0 ? specials : undefined,
        pickupAt: pickupAt || null,
        deliverBy: deliverBy || null,
      });
      Alert.alert(
        'بار ثبت شد ✅',
        'آیا می‌خواهید همین حالا منتشر شود تا رانندگان بتوانند پیشنهاد بدهند؟',
        [
          { text: 'بعداً', style: 'cancel', onPress: () => navigation.goBack() },
          {
            text: 'انتشار',
            onPress: () => {
              publishCargo(created.id)
                .then(() => navigation.goBack())
                .catch(() => {
                  Alert.alert('خطا', 'انتشار ممکن نبود. بار به‌صورت پیش‌نویس ذخیره شد.');
                  navigation.goBack();
                });
            },
          },
        ],
      );
    } catch (e: unknown) {
      const code = e && typeof e === 'object' && 'error' in e
        ? String((e as { error: string }).error) : '';
      setError(CARGO_ERROR_COPY[code] || 'خطا در ایجاد بار');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-forward" size={22} color={COLORS.textDark} />
        </Pressable>
        <Text style={styles.headerTitle}>ثبت بار جدید</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Step indicator */}
      <View style={styles.stepRow}>
        {SECTIONS.map((label, i) => (
          <React.Fragment key={label}>
            <View style={styles.stepWrap}>
              <View style={[styles.stepDot, i <= currentSection && styles.stepDotActive]}>
                {i < currentSection ? (
                  <Ionicons name="checkmark" size={12} color={COLORS.white} />
                ) : (
                  <Text style={[styles.stepNum, i <= currentSection && styles.stepNumActive]}>
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text style={[styles.stepLabel, i <= currentSection && styles.stepLabelActive]}>
                {label}
              </Text>
            </View>
            {i < SECTIONS.length - 1 && (
              <View style={[styles.stepLine, i < currentSection && styles.stepLineActive]} />
            )}
          </React.Fragment>
        ))}
      </View>

      {/* Section 1: Origin / Destination */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>📍 مبدأ و مقصد</Text>
        <LocationPickerRow
          icon="location-outline"
          iconColor={COLORS.blue}
          label="مبدأ"
          value={origin ? `${origin.lat.toFixed(3)}, ${origin.lng.toFixed(3)}` : null}
          onPress={() => pickLocation('origin')}
        />
        <View style={styles.connectorLine} />
        <LocationPickerRow
          icon="flag-outline"
          iconColor={COLORS.red}
          label="مقصد"
          value={destination ? `${destination.lat.toFixed(3)}, ${destination.lng.toFixed(3)}` : null}
          onPress={() => pickLocation('destination')}
        />
      </View>

      {/* Section 2: Cargo details */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>📦 مشخصات بار</Text>

        <FieldLabel text="عنوان" hint="اختیاری" />
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="مثلاً: جعبه لوازم برقی"
          placeholderTextColor={COLORS.gray}
        />

        <FieldLabel text="توضیحات" hint="اختیاری" />
        <TextInput
          style={[styles.input, styles.inputMultiline]}
          value={description}
          onChangeText={setDescription}
          placeholder="توضیحات اضافی درباره بار"
          placeholderTextColor={COLORS.gray}
          multiline
          numberOfLines={3}
        />

        <FieldLabel text="نوع حمل" />
        <View style={styles.chipRow}>
          {TRANSPORT_MODES.map((m) => (
            <Pressable
              key={m}
              style={({ pressed }) => [
                styles.chip,
                transportMode === m && styles.chipActive,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => { hapticLight(); setTransportMode(m); }}
            >
              <Text style={[styles.chipText, transportMode === m && styles.chipTextActive]}>
                {MODE_LABELS[m]}
              </Text>
            </Pressable>
          ))}
        </View>

        <FieldLabel text="ابعاد و وزن" />
        <View style={styles.dimGrid}>
          {([
            ['weightKg', 'وزن', 'kg'],
            ['volumeM3', 'حجم', 'm³'],
            ['lengthCm', 'طول', 'cm'],
            ['widthCm', 'عرض', 'cm'],
            ['heightCm', 'ارتفاع', 'cm'],
          ] as const).map(([key, label, unit]) => (
            <View key={key} style={styles.dimItem}>
              <Text style={styles.dimLabel}>{label}</Text>
              <View style={styles.dimInputWrap}>
                <TextInput
                  style={styles.dimInput}
                  value={(dimensions as Record<string, string>)[key]}
                  onChangeText={(v) => setDimensions((prev) => ({ ...prev, [key]: v }))}
                  keyboardType="numeric"
                  placeholder="0"
                  placeholderTextColor={COLORS.gray}
                />
                <Text style={styles.dimUnit}>{unit}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Section 3: Special + dates */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>⚙️ ویژگی‌ها و تاریخ</Text>

        <FieldLabel text="ویژگی‌های خاص" hint="اختیاری" />
        <View style={styles.chipRow}>
          {SPECIALS.map((s) => (
            <Pressable
              key={s}
              style={({ pressed }) => [
                styles.chip,
                styles.chipSmall,
                specials.includes(s) && styles.chipActiveRed,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => toggleSpecial(s)}
            >
              <Text style={[styles.chipText, styles.chipTextSmall, specials.includes(s) && styles.chipTextActiveRed]}>
                {SPECIAL_LABELS[s]}
              </Text>
            </Pressable>
          ))}
        </View>

        <FieldLabel text="تاریخ بارگیری" hint="اختیاری" />
        <TextInput
          style={styles.input}
          value={pickupAt}
          onChangeText={setPickupAt}
          placeholder="مثال: 1404/06/15"
          placeholderTextColor={COLORS.gray}
        />

        <FieldLabel text="مهلت تحویل" hint="اختیاری" />
        <TextInput
          style={styles.input}
          value={deliverBy}
          onChangeText={setDeliverBy}
          placeholder="مثال: 1404/06/20"
          placeholderTextColor={COLORS.gray}
        />
      </View>

      {/* Error */}
      {error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle" size={16} color={COLORS.red} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Submit */}
      <Pressable
        style={({ pressed }) => [
          styles.submitButton,
          loading && { opacity: 0.55 },
          pressed && !loading && { opacity: 0.92, transform: [{ scale: 0.98 }] },
        ]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <>
            <Ionicons name="checkmark-circle-outline" size={20} color={COLORS.white} />
            <Text style={styles.submitButtonText}>ایجاد و ذخیره بار</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

/* ─── Small helpers ──────────────────────────────────────────── */

function FieldLabel({ text, hint }: { text: string; hint?: string }) {
  return (
    <View style={fieldStyles.row}>
      <Text style={fieldStyles.text}>{text}</Text>
      {hint ? <Text style={fieldStyles.hint}>{hint}</Text> : null}
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginTop: space[4],
    marginBottom: space[2],
  },
  text: {
    fontSize: 13,
    fontFamily: font.medium,
    color: COLORS.textDark,
  },
  hint: {
    fontSize: 11,
    fontFamily: font.regular,
    color: COLORS.textLight,
  },
});

function LocationPickerRow({
  icon,
  iconColor,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.pickerRow,
        pressed && { opacity: 0.85 },
      ]}
      onPress={onPress}
    >
      <View style={[styles.pickerIcon, { backgroundColor: `${iconColor}15` }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.pickerTextWrap}>
        <Text style={styles.pickerLabel}>{label}</Text>
        <Text style={[styles.pickerValue, !value && styles.pickerValuePlaceholder]}>
          {value || 'روی نقشه انتخاب کنید'}
        </Text>
      </View>
      <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
    </Pressable>
  );
}

/* ─── Styles ─────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    marginBottom: space[3],
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: font.bold,
    color: COLORS.textDark,
  },
  // Step indicator
  stepRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space[6],
    marginBottom: space[5],
  },
  stepWrap: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.grayLight,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  stepNum: { fontSize: 11, fontFamily: font.bold, color: COLORS.gray },
  stepNumActive: { color: COLORS.white },
  stepLabel: { fontSize: 10, fontFamily: font.medium, color: COLORS.textLight },
  stepLabelActive: { color: COLORS.blue },
  stepLine: { flex: 1, height: 2, backgroundColor: COLORS.border, marginBottom: 18, marginHorizontal: 6 },
  stepLineActive: { backgroundColor: COLORS.blue },
  // Section card
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: radii.xl,
    marginHorizontal: space[4],
    marginBottom: space[3],
    padding: space[4],
    ...shadows.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: font.bold,
    color: COLORS.textDark,
    marginBottom: space[3],
    textAlign: 'right',
  },
  // Location picker
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.graySurface,
    borderRadius: radii.lg,
    padding: space[3],
    gap: 12,
  },
  pickerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerTextWrap: { flex: 1 },
  pickerLabel: {
    fontSize: 11,
    fontFamily: font.medium,
    color: COLORS.textMid,
  },
  pickerValue: {
    fontSize: 14,
    fontFamily: font.medium,
    color: COLORS.textDark,
    marginTop: 2,
  },
  pickerValuePlaceholder: {
    fontFamily: font.regular,
    color: COLORS.textLight,
  },
  connectorLine: {
    width: 2,
    height: 16,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginVertical: 4,
  },
  // Inputs
  input: {
    backgroundColor: COLORS.graySurface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: space[3],
    paddingVertical: 11,
    fontSize: 14,
    fontFamily: font.regular,
    color: COLORS.textDark,
    textAlign: 'right',
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  // Chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: COLORS.graySurface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  chipSmall: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
  },
  chipActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  chipActiveRed: {
    backgroundColor: COLORS.red,
    borderColor: COLORS.red,
  },
  chipText: {
    fontSize: 13,
    fontFamily: font.medium,
    color: COLORS.textMid,
  },
  chipTextSmall: {
    fontSize: 12,
  },
  chipTextActive: { color: COLORS.white },
  chipTextActiveRed: { color: COLORS.white },
  // Dimensions
  dimGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dimItem: {
    flex: 1,
    minWidth: 90,
  },
  dimLabel: {
    fontSize: 11,
    fontFamily: font.regular,
    color: COLORS.textMid,
    marginBottom: 4,
  },
  dimInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.graySurface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  dimInput: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: font.medium,
    color: COLORS.textDark,
    textAlign: 'center',
  },
  dimUnit: {
    fontSize: 10,
    fontFamily: font.regular,
    color: COLORS.textLight,
    paddingRight: 6,
    paddingLeft: 8,
  },
  // Error
  errorBox: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: space[4],
    marginTop: space[2],
    backgroundColor: COLORS.redTint,
    borderRadius: radii.md,
    padding: 10,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 13,
    fontFamily: font.regular,
    flex: 1,
  },
  // Submit
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: space[4],
    marginTop: space[4],
    backgroundColor: COLORS.green,
    borderRadius: radii.lg,
    height: 52,
    ...shadows.sm,
  },
  submitButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontFamily: font.bold,
  },
});
