import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { COLORS } from '../theme';

interface Props {
  onBack: () => void;
}

export default function ProfileScreen({ onBack }: Props) {
  const { user, signOut } = useAuth();
  const insets = useSafeAreaInsets();

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
      </View>

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
    marginBottom: 24,
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
