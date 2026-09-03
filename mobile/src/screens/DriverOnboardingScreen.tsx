import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../theme';
import { upsertDriverProfile } from '../services/driverApi';

interface Props {
  initialLicense?: string;
  initialProfessionalCard?: string;
  onDone: () => void;
}

export default function DriverOnboardingScreen({ initialLicense, initialProfessionalCard, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [licenseNumber, setLicenseNumber] = useState(initialLicense || '');
  const [professionalCardNumber, setProfessionalCardNumber] = useState(initialProfessionalCard || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await upsertDriverProfile({ licenseNumber, professionalCardNumber });
      onDone();
    } catch (err: any) {
      Alert.alert('خطا', err?.error === 'server_error' ? 'خطا در ارتباط با سرور' : 'ثبت‌نام با خطا مواجه شد');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <View style={{ width: 24 }} />
        <Text style={styles.headerTitle}>ثبت‌نام راننده</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>شماره گواهینامه</Text>
        <TextInput
          style={styles.input}
          value={licenseNumber}
          onChangeText={setLicenseNumber}
          placeholder="شماره گواهینامه"
          placeholderTextColor={COLORS.gray}
        />

        <Text style={styles.label}>شماره کارت حرفه‌ای</Text>
        <TextInput
          style={styles.input}
          value={professionalCardNumber}
          onChangeText={setProfessionalCardNumber}
          placeholder="شماره کارت حرفه‌ای"
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
            <Text style={styles.buttonText}>ثبت‌نام راننده</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    flex: 1,
    textAlign: 'center',
  },
  form: {
    paddingHorizontal: 16,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    marginBottom: 6,
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
    marginBottom: 16,
    writingDirection: 'rtl',
  },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Vazirmatn_700Bold',
  },
});
