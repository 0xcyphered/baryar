import React, { useEffect, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, font, radii, shadows, space, textStyles } from '../theme';
import { hapticLight, hapticMedium, hapticSuccess, hapticWarning } from '../utils/haptics';
import { upsertDriverProfile, getDriverProfile } from '../services/driverApi';

interface Props {
  onBack: () => void;
  onDone: () => void;
}

type FieldErrors = {
  licenseNumber?: string;
  professionalCardNumber?: string;
};
type TouchedFields = {
  licenseNumber?: boolean;
  professionalCardNumber?: boolean;
};

export default function DriverOnboardingScreen({ onBack, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [licenseNumber, setLicenseNumber] = useState('');
  const [professionalCardNumber, setProfessionalCardNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<TouchedFields>({});

  // ─── Prefill from existing profile ─────────────────────────────
  useEffect(() => {
    let cancelled = false;
    getDriverProfile()
      .then((profile) => {
        if (!cancelled) {
          setLicenseNumber(profile.licenseNumber || '');
          setProfessionalCardNumber(profile.professionalCardNumber || '');
        }
      })
      .catch(() => {
        /* new driver — no profile yet */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── Validation ────────────────────────────────────────────────
  const validate = (field: string, value: string): string | undefined => {
    if (field === 'licenseNumber') {
      if (!value.trim()) return 'شماره گواهینامه الزامی است';
      if (value.trim().length < 2) return 'شماره گواهینامه معتبر نیست';
    }
    if (field === 'professionalCardNumber') {
      if (!value.trim()) return 'شماره کارت حرفه‌ای الزامی است';
      if (value.trim().length < 2) return 'شماره کارت حرفه‌ای معتبر نیست';
    }
    return undefined;
  };

  const handleBlur = (field: string, value: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const error = validate(field, value);
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  // ─── Submit ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const licErr = validate('licenseNumber', licenseNumber);
    const cardErr = validate('professionalCardNumber', professionalCardNumber);
    setErrors({ licenseNumber: licErr, professionalCardNumber: cardErr });
    setTouched({ licenseNumber: true, professionalCardNumber: true });

    if (licErr || cardErr) {
      hapticWarning();
      return;
    }

    hapticMedium();
    setSubmitting(true);
    try {
      await upsertDriverProfile({
        licenseNumber: licenseNumber.trim(),
        professionalCardNumber: professionalCardNumber.trim(),
      });
      hapticSuccess();
      onDone();
    } catch (err: any) {
      Alert.alert(
        'خطا',
        err?.error === 'server_error'
          ? 'خطا در ارتباط با سرور'
          : 'ثبت‌نام با خطا مواجه شد',
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Loading state ─────────────────────────────────────────────
  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              hapticLight();
              onBack();
            }}
          >
            <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
          </Pressable>
          <Text style={styles.headerTitle}>ثبت‌نام راننده</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.blue} />
        </View>
      </View>
    );
  }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.keyboardView}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View
        style={[
          styles.container,
          { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[6] },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => {
              hapticLight();
              onBack();
            }}
          >
            <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
          </Pressable>
          <Text style={styles.headerTitle}>ثبت‌نام راننده</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Driver info card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconCircle}>
                <Ionicons name="person-outline" size={24} color={COLORS.blue} />
              </View>
              <Text style={styles.cardTitle}>اطلاعات راننده</Text>
            </View>

            {/* License Number */}
            <Text style={styles.label}>شماره گواهینامه</Text>
            <TextInput
              style={[
                styles.input,
                touched.licenseNumber && errors.licenseNumber && styles.inputError,
              ]}
              value={licenseNumber}
              onChangeText={(v) => {
                setLicenseNumber(v);
                if (touched.licenseNumber) {
                  setErrors((prev) => ({
                    ...prev,
                    licenseNumber: validate('licenseNumber', v),
                  }));
                }
              }}
              onBlur={() => handleBlur('licenseNumber', licenseNumber)}
              placeholder="شماره گواهینامه"
              placeholderTextColor={COLORS.textLight}
            />
            {touched.licenseNumber && errors.licenseNumber ? (
              <Text style={styles.errorText}>{errors.licenseNumber}</Text>
            ) : null}

            {/* Professional Card Number */}
            <Text style={styles.label}>شماره کارت حرفه‌ای</Text>
            <TextInput
              style={[
                styles.input,
                touched.professionalCardNumber &&
                  errors.professionalCardNumber &&
                  styles.inputError,
              ]}
              value={professionalCardNumber}
              onChangeText={(v) => {
                setProfessionalCardNumber(v);
                if (touched.professionalCardNumber) {
                  setErrors((prev) => ({
                    ...prev,
                    professionalCardNumber: validate('professionalCardNumber', v),
                  }));
                }
              }}
              onBlur={() =>
                handleBlur('professionalCardNumber', professionalCardNumber)
              }
              placeholder="شماره کارت حرفه‌ای"
              placeholderTextColor={COLORS.textLight}
            />
            {touched.professionalCardNumber && errors.professionalCardNumber ? (
              <Text style={styles.errorText}>{errors.professionalCardNumber}</Text>
            ) : null}
          </View>

          {/* Submit button */}
          <Pressable
            style={({ pressed }) => [
              styles.button,
              submitting && styles.buttonDisabled,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.buttonText}>ثبت‌نام راننده</Text>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    marginBottom: space[6],
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.xs,
  },
  headerTitle: {
    ...textStyles.h2,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: space[5],
    paddingBottom: space[8],
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: radii.lg,
    padding: space[5],
    marginBottom: space[6],
    borderRightWidth: 3,
    borderRightColor: COLORS.blue,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    marginBottom: space[5],
  },
  cardIconCircle: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: COLORS.blueTint,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardTitle: {
    ...textStyles.h3,
  },
  label: {
    ...textStyles.bodyMedium,
    marginBottom: space[2],
    color: COLORS.textDark,
  },
  input: {
    backgroundColor: COLORS.graySurface,
    borderRadius: radii.md,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    fontSize: 16,
    fontFamily: font.regular,
    color: COLORS.textDark,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: space[2],
  },
  inputError: {
    borderColor: COLORS.red,
    backgroundColor: COLORS.redTint,
  },
  errorText: {
    ...textStyles.caption,
    color: COLORS.red,
    marginBottom: space[3],
    marginTop: -space[1],
  },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: radii.md,
    paddingVertical: space[4],
    alignItems: 'center',
    minHeight: 50,
    ...shadows.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    ...textStyles.button,
  },
});
