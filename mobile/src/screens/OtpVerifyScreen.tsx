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
import { COLORS, font, radii, shadows, space } from '../theme';
import { hapticLight } from '../utils/haptics';

interface Props {
  phone: string;
  onBack: () => void;
}

export default function OtpVerifyScreen({ phone, onBack }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const { verifyOtp } = useAuth();

  const handleVerify = async () => {
    const trimmed = code.trim();
    if (!trimmed || trimmed.length < 4) {
      setError('کد تأیید را وارد کنید');
      return;
    }
    hapticLight();
    setError(null);
    setLoading(true);
    try {
      await verifyOtp(phone, trimmed);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'error' in err
          ? (err as { error: string }).error
          : 'خطای سرور';
      if (msg === 'otp_invalid') setError('کد وارد شده صحیح نیست');
      else if (msg === 'otp_locked') setError('تعداد تلاش‌ها بیش از حد مجاز است');
      else if (msg === 'account_blocked') setError('حساب شما مسدود شده است');
      else setError('خطا در تأیید کد');
    } finally {
      setLoading(false);
    }
  };

  const maskedPhone = phone.replace(/(\d{2})\d+(\d{2})/, '$1****$2');

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Back button */}
      <Pressable style={[styles.backBtn, { marginTop: insets.top + space[3] }]} onPress={onBack}>
        <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
      </Pressable>

      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroCircle}>
          <Ionicons name="keypad-outline" size={36} color={COLORS.white} />
        </View>
        <Text style={styles.heroTitle}>تأیید شماره</Text>
        <Text style={styles.heroSubtitle}>
          کد ۶ رقمی ارسال شده به
        </Text>
        <Text style={styles.phoneText}>{maskedPhone}</Text>
      </View>

      {/* Code input */}
      <View style={styles.card}>
        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={(t) => {
            setCode(t);
            if (error) setError(null);
          }}
          placeholder="·  ·  ·  ·  ·  ·"
          placeholderTextColor={COLORS.gray}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleVerify}
          textAlign="center"
        />

        {/* Dot indicators */}
        <View style={styles.dotRow}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <View
              key={i}
              style={[styles.dot, i < code.length && styles.dotActive]}
            />
          ))}
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
            loading && styles.buttonDisabled,
            pressed && !loading && { opacity: 0.92, transform: [{ scale: 0.98 }] },
          ]}
          onPress={handleVerify}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <Text style={styles.buttonText}>ورود</Text>
          )}
        </Pressable>

        <Text style={styles.hint}>
          کدی دریافت نکردید؟ بعد از ۶۰ ثانیه امتحان کنید
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
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space[4],
  },
  hero: {
    alignItems: 'center',
    paddingTop: space[6],
    paddingBottom: space[5],
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
    fontSize: 22,
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
  },
  phoneText: {
    fontSize: 18,
    fontFamily: font.bold,
    color: COLORS.blue,
    direction: 'ltr',
    marginTop: space[1],
    letterSpacing: 2,
  },
  card: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: space[8],
    paddingHorizontal: space[5],
    marginTop: space[4],
    alignItems: 'center',
    ...shadows.lg,
  },
  codeInput: {
    width: '100%',
    height: 56,
    fontSize: 28,
    fontFamily: font.bold,
    color: COLORS.textDark,
    letterSpacing: 12,
    marginBottom: space[3],
  },
  dotRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: space[4],
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.border,
  },
  dotActive: {
    backgroundColor: COLORS.blue,
  },
  errorRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginBottom: space[3],
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
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
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
  hint: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: space[5],
  },
});
