import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { getPublicSettings } from '../services/settingsApi';
import type { PublicPlatformSettings } from '../types';
import { COLORS } from '../theme';

interface Props {
  onBack: () => void;
}

export default function ProfileScreen({ onBack }: Props) {
  const { user, signOut, updateProfile } = useAuth();
  const insets = useSafeAreaInsets();

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Public settings (support block)
  const [settings, setSettings] = useState<PublicPlatformSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicSettings()
      .then((s) => {
        if (!cancelled) setSettings(s);
      })
      .catch(() => {
        // silent — support row stays hidden
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startEditing = () => {
    setName(user?.name || '');
    setEmail(user?.email || '');
    setNationalId(user?.nationalId || '');
    setSaveError(null);
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await updateProfile({ name, email, nationalId });
      setEditing(false);
    } catch (err: any) {
      if (err && err.error === 'validation_error') {
        setSaveError('مقادیر وارد شده معتبر نیستند');
      } else {
        setSaveError('ذخیره با خطا مواجه شد');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="arrow-forward" size={24} color={COLORS.textDark} />
        </Pressable>
        <Text style={styles.headerTitle}>پروفایل</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Avatar + name */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color={COLORS.white} />
        </View>
        <Text style={styles.userName}>{user?.name || 'کاربر جدید'}</Text>
        <Text style={[styles.userPhone, { direction: 'ltr' }]}>
          {user?.phone || ''}
        </Text>
      </View>

      {/* Info cards */}
      <View style={styles.infoSection}>
        <InfoRow icon="call-outline" label="تلفن" value={user?.phone || '-'} />
        <InfoRow
          icon="checkmark-circle-outline"
          label="وضعیت"
          value={user?.status === 'active' ? 'فعال' : user?.status || '-'}
          valueColor={user?.status === 'active' ? COLORS.green : COLORS.red}
        />
        <InfoRow
          icon="shield-checkmark-outline"
          label="نقش"
          value={
            user?.roles?.includes('driver')
              ? 'راننده'
              : user?.roles?.includes('admin')
              ? 'مدیر'
              : 'صاحب بار'
          }
        />
        {user?.email ? (
          <InfoRow icon="mail-outline" label="ایمیل" value={user.email} />
        ) : null}
        {user?.nationalId ? (
          <InfoRow icon="id-card-outline" label="کد ملی" value={user.nationalId} />
        ) : null}
      </View>

      {/* Edit profile */}
      {editing ? (
        <View style={styles.editSection}>
          <Text style={styles.editLabel}>نام</Text>
          <TextInput
            style={styles.editInput}
            value={name}
            onChangeText={setName}
            placeholder="نام و نام خانوادگی"
            placeholderTextColor={COLORS.gray}
          />
          <Text style={styles.editLabel}>ایمیل</Text>
          <TextInput
            style={[styles.editInput, { direction: 'ltr' }]}
            value={email}
            onChangeText={setEmail}
            placeholder="email@example.com"
            placeholderTextColor={COLORS.gray}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Text style={styles.editLabel}>کد ملی</Text>
          <TextInput
            style={[styles.editInput, { direction: 'ltr' }]}
            value={nationalId}
            onChangeText={setNationalId}
            placeholder="کد ملی"
            placeholderTextColor={COLORS.gray}
            keyboardType="number-pad"
          />
          {saveError ? <Text style={styles.saveError}>{saveError}</Text> : null}
          <View style={styles.editButtons}>
            <Pressable
              style={[styles.saveButton, saving && styles.buttonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>ذخیره</Text>
              )}
            </Pressable>
            <Pressable style={styles.cancelButton} onPress={() => setEditing(false)}>
              <Text style={styles.cancelButtonText}>انصراف</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable style={styles.editButton} onPress={startEditing}>
          <Ionicons name="create-outline" size={18} color={COLORS.blue} />
          <Text style={styles.editButtonText}>ویرایش پروفایل</Text>
        </Pressable>
      )}

      {/* Support block */}
      {settings?.supportPhone ? (
        <Pressable
          style={styles.supportRow}
          onPress={() => Linking.openURL(`tel:${settings.supportPhone}`)}
        >
          <Ionicons name="call-outline" size={20} color={COLORS.textMid} />
          <Text style={styles.supportLabel}>پشتیبانی</Text>
          <Text style={[styles.supportValue, { direction: 'ltr' }]}>{settings.supportPhone}</Text>
        </Pressable>
      ) : null}

      {/* Logout */}
      <Pressable style={styles.logoutButton} onPress={signOut}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.red} />
        <Text style={styles.logoutText}>خروج از حساب</Text>
      </Pressable>
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={infoStyles.row}>
      <Ionicons name={icon as any} size={20} color={COLORS.textMid} />
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={[infoStyles.value, valueColor ? { color: valueColor } : undefined]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  userName: {
    fontSize: 18,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    marginBottom: 4,
  },
  userPhone: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
  },
  infoSection: {
    backgroundColor: COLORS.grayLight,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  editButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.blue,
    marginBottom: 16,
  },
  editButtonText: {
    fontSize: 15,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.blue,
  },
  editSection: {
    backgroundColor: COLORS.grayLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  editLabel: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    marginBottom: 4,
    marginTop: 8,
  },
  editInput: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textDark,
  },
  saveError: {
    fontSize: 12,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.red,
    marginTop: 8,
  },
  editButtons: {
    flexDirection: 'row-reverse',
    gap: 8,
    marginTop: 12,
  },
  saveButton: {
    flex: 1,
    backgroundColor: COLORS.blue,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Vazirmatn_700Bold',
  },
  cancelButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray,
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textMid,
  },
  supportRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.grayLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  supportLabel: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    flex: 1,
  },
  supportValue: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.blue,
  },
  logoutButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.red,
  },
  logoutText: {
    fontSize: 16,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.red,
  },
});

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    flex: 1,
  },
  value: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_500Medium',
    color: COLORS.textDark,
    direction: 'ltr',
  },
});
