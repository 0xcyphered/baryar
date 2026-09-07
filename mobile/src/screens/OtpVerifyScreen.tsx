import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  hapticLight,
  hapticMedium,
  hapticSuccess,
} from '../utils/haptics';

interface Props {
  phone: string;
  onBack: () => void;
}

const AUTO_SUBMIT_DELAY = 300; // ms — brief pause so user sees dots fill
const RESEND_SECONDS = 60;

/** Convert number to Persian digits for the countdown display. */
function toPersianDigits(n: number): string {
  return n.toString().replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[+d]);
}

export default function OtpVerifyScreen({ phone, onBack }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const insets = useSafeAreaInsets();
  const { verifyOtp, signIn } = useAuth();

  const autoSubmitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resendInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Resend countdown ────────────────────────────────────────────
  useEffect(() => {
    resendInterval.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          if (resendInterval.current) clearInterval(resendInterval.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (resendInterval.current) clearInterval(resendInterval.current);
    };
  }, []);

  // Cleanup auto-submit timer on unmount
  useEffect(() => {
    return () => {
      if (autoSubmitTimer.current) clearTimeout(autoSubmitTimer.current);
    };
  }, []);

  // ── Verify handler ──────────────────────────────────────────────
  const handleVerify = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed || trimmed.length < 4) {
      setError('کد تأیید را وارد کنید');
      return;
    }
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
      // On error, clear the code so user can re-enter
      setCode('');
    } finally {
      setLoading(false);
    }
  }, [code, phone, verifyOtp]);

  // ── Resend handler ──────────────────────────────────────────────
  const handleResend = useCallback(async () => {
    if (secondsLeft > 0 || resending) return;
    hapticMedium();
    setResendMessage(null);
    setResending(true);
    try {
      await signIn(phone);
      setSecondsLeft(RESEND_SECONDS);
      setResendMessage('کد جدید ارسال شد');
      hapticSuccess();
      // Clear message after 3 seconds
      setTimeout(() => setResendMessage(null), 3000);
      // Restart the countdown interval
      if (resendInterval.current) clearInterval(resendInterval.current);
      resendInterval.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            if (resendInterval.current) clearInterval(resendInterval.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setError('خطا در ارسال مجدد کد');
    } finally {
      setResending(false);
    }
  }, [secondsLeft, resending, phone, signIn]);

  // ── Text change with auto-submit ────────────────────────────────
  const handleCodeChange = useCallback(
    (text: string) => {
      setCode(text);
      if (error) setError(null);
      if (resendMessage) setResendMessage(null);

      // Cancel any pending auto-submit
      if (autoSubmitTimer.current) {
        clearTimeout(autoSubmitTimer.current);
        autoSubmitTimer.current = null;
      }

      // Auto-submit when exactly 6 digits
      if (text.length === 6) {
        hapticSuccess();
        autoSubmitTimer.current = setTimeout(() => {
          // Read the latest code from the closure — safe because handleVerify
          // reads from state which will be updated by the time this fires.
          handleVerify();
          autoSubmitTimer.current = null;
        }, AUTO_SUBMIT_DELAY);
      }
    },
    [error, resendMessage, handleVerify],
  );

  // ── Back button handler ─────────────────────────────────────────
  const handleBack = useCallback(() => {
    hapticLight();
    onBack();
  }, [onBack]);

  const maskedPhone = phone.replace(/(\d{2})\d+(\d{2})/, '$1****$2');
  const isVerifying = loading;
  const canResend = secondsLeft === 0 && !resending;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Back button */}
      <Pressable
        style={[styles.backBtn, { marginTop: insets.top + space[3] }]}
        onPress={handleBack}
      >
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

      {/* Code input card */}
      <View style={styles.card}>
        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={handleCodeChange}
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

        {/* Auto-submit indicator */}
        {isVerifying && (
          <View style={styles.verifyingRow}>
            <ActivityIndicator size="small" color={COLORS.blue} />
            <Text style={styles.verifyingText}>در حال تأیید...</Text>
          </View>
        )}

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={14} color={COLORS.red} />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}

        {/* Verify button (manual fallback) */}
        <Pressable
          style={({ pressed }) => [
            styles.button,
            (loading || isVerifying) && styles.buttonDisabled,
            pressed &&
              !loading &&
              !isVerifying && {
                opacity: 0.92,
                transform: [{ scale: 0.98 }],
              },
          ]}
          onPress={() => {
            hapticMedium();
            handleVerify();
          }}
          disabled={loading || isVerifying}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <Text style={styles.buttonText}>ورود</Text>
          )}
        </Pressable>

        {/* Resend section */}
        <View style={styles.resendSection}>
          {resendMessage ? (
            <View style={styles.resendSuccessRow}>
              <Ionicons
                name="checkmark-circle"
                size={14}
                color={COLORS.green}
              />
              <Text style={styles.resendSuccessText}>{resendMessage}</Text>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [
              styles.resendButton,
              !canResend && styles.resendButtonDisabled,
              pressed &&
                canResend && {
                  opacity: 0.7,
                  transform: [{ scale: 0.98 }],
                },
            ]}
            onPress={handleResend}
            disabled={!canResend}
          >
            {resending ? (
              <ActivityIndicator size="small" color={COLORS.blue} />
            ) : (
              <Text
                style={[
                  styles.resendText,
                  !canResend && styles.resendTextDisabled,
                ]}
              >
                {secondsLeft > 0
                  ? `ارسال مجدد (${toPersianDigits(secondsLeft)})`
                  : 'ارسال مجدد'}
              </Text>
            )}
          </Pressable>
        </View>
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
  verifyingRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: space[2],
    marginBottom: space[3],
  },
  verifyingText: {
    fontSize: 13,
    fontFamily: font.regular,
    color: COLORS.blue,
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
  resendSection: {
    alignItems: 'center',
    marginTop: space[6],
    width: '100%',
  },
  resendSuccessRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 4,
    marginBottom: space[2],
  },
  resendSuccessText: {
    fontSize: 13,
    fontFamily: font.medium,
    color: COLORS.green,
  },
  resendButton: {
    paddingVertical: space[2],
    paddingHorizontal: space[4],
  },
  resendButtonDisabled: {
    opacity: 0.45,
  },
  resendText: {
    fontSize: 14,
    fontFamily: font.medium,
    color: COLORS.blue,
    textAlign: 'center',
  },
  resendTextDisabled: {
    color: COLORS.gray,
  },
});
