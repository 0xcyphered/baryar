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
import { hapticLight, hapticSuccess, hapticWarning } from '../utils/haptics';
import { ACTIVE_ROLE_LABEL, APP_ROLE_ORDER, ROLE_META } from '../utils/constants';
import type { PublicPlatformSettings } from '../types';
import { COLORS, font, radii, shadows, space, textStyles } from '../theme';

interface Props {
  onBack: () => void;
}

export default function ProfileScreen({ onBack }: Props) {
  const { user, signOut, updateProfile, activeRole, setActiveRole } = useAuth();
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
    hapticLight();
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
      hapticSuccess();
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

  const handleLogout = () => {
    hapticWarning();
    Alert.alert('خروج از حساب', 'آیا مطمئن هستید؟', [
      { text: 'انصراف', style: 'cancel' },
      { text: 'خروج', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            hapticLight();
            onBack();
          }}
        >
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
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <Text style={styles.saveButtonText}>ذخیره</Text>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && { opacity: 0.85 },
              ]}
              onPress={() => {
                hapticLight();
                setEditing(false);
              }}
            >
              <Text style={styles.cancelButtonText}>انصراف</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.editButton,
            pressed && { opacity: 0.85 },
          ]}
          onPress={startEditing}
        >
          <Ionicons name="create-outline" size={18} color={COLORS.blue} />
          <Text style={styles.editButtonText}>ویرایش پروفایل</Text>
        </Pressable>
      )}

      {/* Plan 040: experience-mode switcher (client-side only) */}
      <View style={styles.roleSection}>
        <Text style={styles.roleSectionTitle}>حالت استفاده</Text>
        {APP_ROLE_ORDER.map((role) => {
          const meta = ROLE_META[role];
          const isActive = activeRole === role;
          return (
            <Pressable
              key={role}
              style={({ pressed }) => [
                styles.roleRow,
                isActive && styles.roleRowActive,
                pressed && { opacity: 0.9 },
              ]}
              onPress={() => {
                hapticLight();
                void setActiveRole(role);
              }}
            >
              <View style={[styles.roleIconCircle, { backgroundColor: meta.tint }]}>
                <Ionicons name={meta.icon as never} size={20} color={meta.color} />
              </View>
              <View style={styles.roleTextWrap}>
                <Text style={styles.roleRowTitle}>{meta.label}</Text>
                <Text style={styles.roleRowTagline}>{meta.tagline}</Text>
              </View>
              {isActive ? (
                <Ionicons name="checkmark-circle" size={22} color={meta.color} />
              ) : (
                <Ionicons name="ellipse-outline" size={22} color={COLORS.gray} />
              )}
            </Pressable>
          );
        })}
        <Text style={styles.roleHint}>{ACTIVE_ROLE_LABEL[activeRole ?? 'cargo_owner']} فعال است</Text>
      </View>

      {/* Support block */}
      {settings?.supportPhone ? (
        <Pressable
          style={({ pressed }) => [
            styles.supportRow,
            pressed && { opacity: 0.85 },
          ]}
          onPress={() => {
            hapticLight();
            Linking.openURL(`tel:${settings.supportPhone}`);
          }}
        >
          <Ionicons name="call-outline" size={20} color={COLORS.textMid} />
          <Text style={styles.supportLabel}>پشتیبانی</Text>
          <Text style={[styles.supportValue, { direction: 'ltr' }]}>{settings.supportPhone}</Text>
        </Pressable>
      ) : null}

      {/* Logout */}
      <Pressable
        style={({ pressed }) => [
          styles.logoutButton,
          pressed && { opacity: 0.85 },
        ]}
        onPress={handleLogout}
      >
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
    backgroundColor: COLORS.bgWarm,
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
    ...textStyles.h2,
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
    ...shadows.sm,
  },
  userName: {
    ...textStyles.h2,
    marginBottom: 4,
  },
  userPhone: {
    ...textStyles.body,
    color: COLORS.textMid,
  },
  infoSection: {
    backgroundColor: COLORS.white,
    borderRadius: radii.lg,
    padding: space[4],
    gap: space[3],
    marginBottom: space[4],
    ...shadows.sm,
  },
  editButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingVertical: space[3],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: COLORS.blue,
    marginBottom: space[4],
  },
  editButtonText: {
    ...textStyles.bodyMedium,
    color: COLORS.blue,
  },
  editSection: {
    backgroundColor: COLORS.white,
    borderRadius: radii.lg,
    padding: space[4],
    marginBottom: space[4],
    ...shadows.sm,
  },
  editLabel: {
    fontSize: 13,
    fontFamily: font.medium,
    color: COLORS.textDark,
    marginBottom: 4,
    marginTop: 8,
  },
  editInput: {
    backgroundColor: COLORS.grayLight,
    borderRadius: radii.md,
    paddingHorizontal: space[3],
    paddingVertical: 10,
    ...textStyles.body,
  },
  saveError: {
    ...textStyles.caption,
    color: COLORS.red,
    marginTop: space[2],
  },
  editButtons: {
    flexDirection: 'row-reverse',
    gap: space[2],
    marginTop: space[3],
  },
  saveButton: {
    flex: 1,
    backgroundColor: COLORS.blue,
    borderRadius: radii.md,
    paddingVertical: space[3],
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: {
    ...textStyles.buttonSmall,
    color: COLORS.white,
  },
  cancelButton: {
    flex: 1,
    borderRadius: radii.md,
    paddingVertical: space[3],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.gray,
  },
  cancelButtonText: {
    ...textStyles.bodyMedium,
    color: COLORS.textMid,
  },
  // Plan 040: experience-mode switcher
  roleSection: {
    backgroundColor: COLORS.white,
    borderRadius: radii.lg,
    padding: space[4],
    marginBottom: space[4],
    ...shadows.sm,
  },
  roleSectionTitle: {
    ...textStyles.bodyMedium,
    color: COLORS.textDark,
    marginBottom: space[3],
  },
  roleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: COLORS.grayLight,
    borderRadius: radii.md,
    padding: space[3],
    marginBottom: space[2],
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  roleRowActive: {
    borderColor: COLORS.blue,
    backgroundColor: COLORS.white,
  },
  roleIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleTextWrap: {
    flex: 1,
  },
  roleRowTitle: {
    ...textStyles.bodyMedium,
    color: COLORS.textDark,
  },
  roleRowTagline: {
    ...textStyles.caption,
    color: COLORS.textMid,
    marginTop: 2,
  },
  roleHint: {
    ...textStyles.small,
    textAlign: 'center',
    marginTop: 2,
  },
  supportRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: space[2] + 2,
    backgroundColor: COLORS.white,
    borderRadius: radii.lg,
    padding: space[3] + 2,
    marginBottom: space[4],
    ...shadows.xs,
  },
  supportLabel: {
    ...textStyles.body,
    color: COLORS.textMid,
    flex: 1,
  },
  supportValue: {
    ...textStyles.bodyMedium,
    color: COLORS.blue,
  },
  logoutButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingVertical: space[3] + 2,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: COLORS.red,
  },
  logoutText: {
    ...textStyles.bodyMedium,
    color: COLORS.red,
    fontSize: 16,
  },
});

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: space[3],
  },
  label: {
    ...textStyles.body,
    color: COLORS.textMid,
    flex: 1,
  },
  value: {
    ...textStyles.bodyMedium,
    color: COLORS.textDark,
    direction: 'ltr',
  },
});
