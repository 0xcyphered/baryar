import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { COLORS, font, radii, shadows, space, textStyles } from '../theme';
import { hapticLight } from '../utils/haptics';

interface Props {
  onSent: (phone: string) => void;
}

export default function OtpRequestScreen({ onSent }: Props) {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();

  const handleSend = async () => {
    const trimmed = phone.trim();
    if (!trimmed) {
      setError('شماره تلفن را وارد کنید');
      return;
    }
    hapticLight();
    setError(null);
    setLoading(true);
    try {
      await signIn(trimmed);
      onSent(trimmed);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'error' in err
          ? (err as { error: string }).error
          : 'خطای سرور';
      if (msg === 'invalid_phone') setError('شماره تلفن نامعتبر است');
      else if (msg === 'otp_cooldown') setError('لطفاً چند ثانیه صبر کنید');
      else if (msg === 'rate_limited') setError('تعداد درخواست‌ها زیاد است');
      else setError('خطا در ارسال کد');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroCircle}>
          <Ionicons name="phone-portrait-outline" size={36} color={COLORS.white} />
        </View>
        <Text style={styles.heroTitle}>به بریار خوش آمدید</Text>
        <Text style={styles.heroSubtitle}>
          برای شروع، شماره تلفن خود را وارد کنید
        </Text>
      </View>

      {/* Form card */}
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>شماره تلفن</Text>
        <View style={styles.inputRow}>
          <View style={styles.countryCode}>
            <Text style={styles.countryCodeText}>+98</Text>
          </View>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              if (error) setError(null);
            }}
            placeholder="9121234567"
            placeholderTextColor={COLORS.gray}
            keyboardType="phone-pad"
            maxLength={16}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleSend}
          />
        </View>

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={14} color={COLORS.red} />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (loading) && styles.buttonDisabled,
            pressed && !loading && { opacity: 0.92, transform: [{ scale: 0.98 }] },
          ]}
          onPress={handleSend}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <Text style={styles.buttonText}>ارسال کد تأیید</Text>
          )}
        </Pressable>

        <Text style={styles.footnote}>
          با ورود، شما قوانین و شرایط استفاده از بریار را می‌پذیرید
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  hero: {
    alignItems: 'center',
    paddingTop: space[10],
    paddingBottom: space[8],
  },
  heroCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[4],
    ...shadows.lg,
  },
  heroTitle: {
    fontSize: 24,
    fontFamily: font.bold,
    color: COLORS.textDark,
    textAlign: 'center',
    marginBottom: space[2],
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: font.regular,
    color: COLORS.textMid,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: space[8],
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: space[6],
    paddingHorizontal: space[5],
    marginTop: space[4],
    ...shadows.lg,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: font.medium,
    color: COLORS.textMid,
    marginBottom: space[2],
    marginRight: space[1],
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  countryCode: {
    backgroundColor: COLORS.grayLight,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countryCodeText: {
    fontSize: 16,
    fontFamily: font.medium,
    color: COLORS.textDark,
    direction: 'ltr',
  },
  input: {
    flex: 1,
    height: 50,
    backgroundColor: COLORS.graySurface,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    fontSize: 18,
    fontFamily: font.medium,
    color: COLORS.textDark,
    direction: 'ltr',
    textAlign: 'left',
  },
  errorRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginTop: space[2],
  },
  error: {
    fontSize: 13,
    fontFamily: font.regular,
    color: COLORS.red,
  },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: radii.lg,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space[5],
    ...shadows.sm,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: font.bold,
    color: COLORS.white,
  },
  footnote: {
    fontSize: 11,
    fontFamily: font.regular,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: space[4],
    lineHeight: 18,
  },
});
