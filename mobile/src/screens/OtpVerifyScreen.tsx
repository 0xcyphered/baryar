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
    setError(null);
    setLoading(true);
    try {
      await verifyOtp(phone, trimmed);
      // AuthContext state change will re-render the app into the main screen.
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'error' in err
          ? (err as { error: string }).error
          : 'خطای سرور';
      if (msg === 'otp_invalid') {
        setError('کد وارد شده صحیح نیست');
      } else if (msg === 'otp_locked') {
        setError('تعداد تلاش‌ها بیش از حد مجاز است');
      } else if (msg === 'account_blocked') {
        setError('حساب شما مسدود شده است');
      } else {
        setError('خطا در تأیید کد');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40 }]}>
      <Pressable style={styles.backButton} onPress={onBack}>
        <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
      </Pressable>

      <View style={styles.iconWrap}>
        <Ionicons name="keypad-outline" size={48} color={COLORS.blue} />
      </View>

      <Text style={styles.title}>کد تأیید</Text>
      <Text style={styles.subtitle}>
        کد ۶ رقمی ارسال شده به{'\n'}
        <Text style={styles.phone}>{phone}</Text>
      </Text>

      <TextInput
        style={styles.input}
        value={code}
        onChangeText={setCode}
        placeholder="------"
        placeholderTextColor={COLORS.gray}
        keyboardType="number-pad"
        maxLength={6}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={handleVerify}
        textAlign="center"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleVerify}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={COLORS.white} size="small" />
        ) : (
          <Text style={styles.buttonText}>تأیید</Text>
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
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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
  phone: {
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    direction: 'ltr',
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.gray,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    letterSpacing: 8,
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
