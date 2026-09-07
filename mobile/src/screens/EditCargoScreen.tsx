import React, { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { getCargo, updateCargo } from '../services/cargoApi';
import { registerLocationCallback } from './LocationPickerScreen';
import { MODE_LABELS, SPECIAL_LABELS, CARGO_ERROR_COPY } from '../utils/constants';

const TRANSPORT_MODES = ['land', 'sea', 'air', 'rail', 'multimodal'] as const;

const SPECIALS = ['hazardous', 'fragile', 'refrigerated', 'livestock', 'oversized', 'other'] as const;

type ParamList = {
  EditCargo: { cargoId: string };
};

export default function EditCargoScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const params = (route.params || {}) as { cargoId?: string };
  const cargoId = params.cargoId || '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [transportMode, setTransportMode] = useState<string>('land');
  const [dimensions, setDimensions] = useState({
    weightKg: '',
    volumeM3: '',
    lengthCm: '',
    widthCm: '',
    heightCm: '',
  });
  const [specials, setSpecials] = useState<string[]>([]);
  const [pickupAt, setPickupAt] = useState('');
  const [deliverBy, setDeliverBy] = useState('');
  const [cargoStatus, setCargoStatus] = useState('');
  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  const [destination, setDestination] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const cargo = await getCargo(cargoId);
        if (cargo.status !== 'draft') {
          setError('فقط بارهای پیش‌نویس قابل ویرایش هستند');
          return;
        }
        setCargoStatus(cargo.status);
        setTitle(cargo.title || '');
        setDescription(cargo.description || '');
        setTransportMode(cargo.transportMode);
        setDimensions({
          weightKg: String(cargo.dimensions.weightKg || ''),
          volumeM3: String(cargo.dimensions.volumeM3 || ''),
          lengthCm: String(cargo.dimensions.lengthCm || ''),
          widthCm: String(cargo.dimensions.widthCm || ''),
          heightCm: String(cargo.dimensions.heightCm || ''),
        });
        setSpecials(cargo.specialCharacteristics || []);
        setOrigin({
          lat: cargo.origin.location.coordinates[1],
          lng: cargo.origin.location.coordinates[0],
        });
        setDestination({
          lat: cargo.destination.location.coordinates[1],
          lng: cargo.destination.location.coordinates[0],
        });
        setPickupAt(cargo.pickupAt ? cargo.pickupAt.slice(0, 10) : '');
        setDeliverBy(cargo.deliverBy ? cargo.deliverBy.slice(0, 10) : '');
      } catch {
        setError('خطا در بارگیری اطلاعات بار');
      } finally {
        setLoading(false);
      }
    })();
  }, [cargoId]);

  const pickLocation = (mode: 'origin' | 'destination') => {
    const key = `edit_${mode}`;
    registerLocationCallback(key, (lat, lng) => {
      if (mode === 'origin') setOrigin({ lat, lng });
      else setDestination({ lat, lng });
    });
    navigation.navigate('LocationPicker' as never, { mode } as never);
  };

  const toggleSpecial = (s: string) => {
    setSpecials((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateCargo(cargoId, {
        title,
        description,
        transportMode,
        origin: origin
          ? { address: '', location: { type: 'Point', coordinates: [origin.lng, origin.lat] } }
          : undefined,
        destination: destination
          ? { address: '', location: { type: 'Point', coordinates: [destination.lng, destination.lat] } }
          : undefined,
        dimensions: {
          weightKg: Number(dimensions.weightKg) || 0,
          volumeM3: Number(dimensions.volumeM3) || 0,
          lengthCm: Number(dimensions.lengthCm) || 0,
          widthCm: Number(dimensions.widthCm) || 0,
          heightCm: Number(dimensions.heightCm) || 0,
        },
        specialCharacteristics: specials,
        pickupAt: pickupAt || null,
        deliverBy: deliverBy || null,
      });
      navigation.goBack();
    } catch (e: unknown) {
      const code = e && typeof e === 'object' && 'error' in e
        ? String((e as { error: string }).error)
        : '';
      setError(CARGO_ERROR_COPY[code] || 'خطا در ویرایش بار');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
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
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
        </Pressable>
        <Text style={styles.headerTitle}>ویرایش بار</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Origin */}
      <Pressable style={styles.pickerRow} onPress={() => pickLocation('origin')}>
        <Ionicons name="location-outline" size={20} color={COLORS.blue} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.pickerLabel}>مبدأ</Text>
          <Text style={styles.pickerValue}>
            {origin ? `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}` : 'روی نقشه انتخاب کنید'}
          </Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
      </Pressable>

      {/* Destination */}
      <Pressable style={styles.pickerRow} onPress={() => pickLocation('destination')}>
        <Ionicons name="flag-outline" size={20} color={COLORS.red} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.pickerLabel}>مقصد</Text>
          <Text style={styles.pickerValue}>
            {destination ? `${destination.lat.toFixed(4)}, ${destination.lng.toFixed(4)}` : 'روی نقشه انتخاب کنید'}
          </Text>
        </View>
        <Ionicons name="chevron-back" size={18} color={COLORS.gray} />
      </Pressable>

      {/* Title */}
      <Text style={styles.fieldLabel}>عنوان</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="عنوان بار"
        placeholderTextColor={COLORS.gray}
        textAlign="right"
      />

      {/* Description */}
      <Text style={styles.fieldLabel}>توضیحات</Text>
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="توضیحات بار"
        placeholderTextColor={COLORS.gray}
        multiline
        numberOfLines={3}
        textAlign="right"
      />

      {/* Transport mode */}
      <Text style={styles.fieldLabel}>نوع حمل</Text>
      <View style={styles.chipRow}>
        {TRANSPORT_MODES.map((m) => (
          <Pressable
            key={m}
            style={[styles.chip, transportMode === m && styles.chipActive]}
            onPress={() => setTransportMode(m)}
          >
            <Text style={[styles.chipText, transportMode === m && styles.chipTextActive]}>
              {MODE_LABELS[m]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Dimensions */}
      <Text style={styles.fieldLabel}>ابعاد</Text>
      <View style={styles.dimGrid}>
        {([
          ['weightKg', 'وزن (kg)'],
          ['volumeM3', 'حجم (m³)'],
          ['lengthCm', 'طول (cm)'],
          ['widthCm', 'عرض (cm)'],
          ['heightCm', 'ارتفاع (cm)'],
        ] as const).map(([key, label]) => (
          <View key={key} style={styles.dimItem}>
            <Text style={styles.dimLabel}>{label}</Text>
            <TextInput
              style={styles.dimInput}
              value={(dimensions as Record<string, string>)[key]}
              onChangeText={(v) => setDimensions((prev) => ({ ...prev, [key]: v }))}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={COLORS.gray}
              textAlign="center"
            />
          </View>
        ))}
      </View>

      {/* Special characteristics */}
      <Text style={styles.fieldLabel}>ویژگی‌های خاص</Text>
      <View style={styles.chipRow}>
        {SPECIALS.map((s) => (
          <Pressable
            key={s}
            style={[styles.chip, specials.includes(s) && styles.chipActive]}
            onPress={() => toggleSpecial(s)}
          >
            <Text style={[styles.chipText, specials.includes(s) && styles.chipTextActive]}>
              {SPECIAL_LABELS[s]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Dates */}
      <Text style={styles.fieldLabel}>تاریخ بارگیری</Text>
      <TextInput
        style={styles.input}
        value={pickupAt}
        onChangeText={setPickupAt}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={COLORS.gray}
        textAlign="right"
      />

      <Text style={styles.fieldLabel}>مهلت تحویل</Text>
      <TextInput
        style={styles.input}
        value={deliverBy}
        onChangeText={setDeliverBy}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={COLORS.gray}
        textAlign="right"
      />

      {/* Error */}
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Submit */}
      <Pressable
        style={[styles.submitButton, saving && { opacity: 0.6 }]}
        onPress={handleSubmit}
        disabled={saving}
      >
        <Text style={styles.submitButtonText}>
          {saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}
        </Text>
      </Pressable>
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
    fontSize: 18,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  pickerLabel: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textMid,
  },
  pickerValue: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textDark,
    marginTop: 2,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textMid,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textDark,
  },
  inputMultiline: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray,
  },
  chipActive: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  chipText: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textMid,
  },
  chipTextActive: {
    color: COLORS.white,
  },
  dimGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: 16,
    gap: 8,
  },
  dimItem: {
    flex: 1,
    minWidth: 100,
  },
  dimLabel: {
    fontSize: 11,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    marginBottom: 4,
  },
  dimInput: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textDark,
    borderWidth: 1,
    borderColor: COLORS.gray,
  },
  errorBox: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    color: COLORS.red,
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    textAlign: 'center',
  },
  submitButton: {
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontFamily: 'Vazirmatn_700Bold',
  },
});
