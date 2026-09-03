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
import { COLORS } from '../theme';

interface Props {
  /** Navigate to the verify screen after OTP is sent. */
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
      if (msg === 'invalid_phone') {
        setError('شماره تلفن نامعتبر است');
      } else if (msg === 'otp_cooldown') {
        setError('لطفاً چند ثانیه صبر کنید');
      } else if (msg === 'rate_limited') {
        setError('تعداد درخواست‌ها زیاد است، لطفاً بعداً تلاش کنید');
      } else {
        setError('خطا در ارسال کد');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      <View style={styles.iconWrap}>
        <Ionicons name="phone-portrait-outline" size={48} color={COLORS.blue} />
      </View>

      <Text style={styles.title}>ورود به بازیار</Text>
      <Text style={styles.subtitle}>
        شماره تلفن خود را وارد کنید تا کد تأیید دریافت کنید
      </Text>

      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="09121234567"
        placeholderTextColor={COLORS.gray}
        keyboardType="phone-pad"
        maxLength={16}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleSend}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSend}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <Text style={styles.buttonText}>ارسال کد</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingHorizontal: 24,
  },
  iconWrap: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textDark,
    textAlign: 'center',
    direction: 'ltr',
    marginBottom: 8,
  },
  error: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.red,
    textAlign: 'center',
    marginBottom: 12,
  },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.white,
  },
});
