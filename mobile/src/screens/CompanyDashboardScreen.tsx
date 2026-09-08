/**
 * Plan 051 — Transport company placeholder dashboard
 *
 * Premium dashboard for `transport_company` role. Shows profile info,
 * fleet overview placeholder, and coming-soon action cards. No backend
 * company API exists yet — all data comes from useAuth().user.
 */
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { hapticLight } from '../utils/haptics';
import { COLORS, font, radii, shadows, space } from '../theme';
import { ROLE_META } from '../utils/constants';

/* ─── Constants ─────────────────────────────────────────────── */

const COMPANY_META = ROLE_META.transport_company;

interface QuickAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
}

const ACTIONS: QuickAction[] = [
  { icon: 'briefcase-outline', label: 'مدیریت ناوگان', color: COLORS.blue },
  { icon: 'people-outline', label: 'مدیریت رانندگان', color: COLORS.green },
  { icon: 'bar-chart-outline', label: 'گزارش سفرها', color: COLORS.amber },
  { icon: 'settings-outline', label: 'تنظیمات شرکت', color: COLORS.grayMid },
];

/* ─── Screen ────────────────────────────────────────────────── */

export default function CompanyDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [pressedCard, setPressedCard] = useState<string | null>(null);

  const companyName = user?.name || 'شرکت حمل و نقل';
  const phone = user?.phone || '';

  const handleActionPress = (label: string) => {
    hapticLight();
    Alert.alert('به‌زودی', `بخش «${label}» در آپدیت بعدی فعال خواهد شد.`);
  };

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{
        paddingTop: insets.top + space[4],
        paddingBottom: insets.bottom + space[6],
        paddingHorizontal: space[4],
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <View style={s.header}>
        <Text style={s.title}>شرکت حمل و نقل</Text>
        <View style={[s.headerIcon, { backgroundColor: COMPANY_META.tint }]}>
          <Ionicons
            name={COMPANY_META.icon as any}
            size={22}
            color={COMPANY_META.color}
          />
        </View>
      </View>

      {/* ── Profile Card ────────────────────────────────────── */}
      <Pressable
        style={({ pressed }) => [
          s.card,
          pressed && s.cardPressed,
        ]}
        onPressIn={() => setPressedCard('profile')}
        onPressOut={() => setPressedCard(null)}
      >
        <View style={s.profileRow}>
          <View style={[s.avatarCircle, { backgroundColor: COMPANY_META.tint }]}>
            <Ionicons
              name="business-outline"
              size={28}
              color={COMPANY_META.color}
            />
          </View>
          <View style={s.profileInfo}>
            <Text style={s.profileName} numberOfLines={1}>
              {companyName}
            </Text>
            {phone ? (
              <Text style={s.profilePhone}>{phone}</Text>
            ) : null}
          </View>
        </View>
        <View style={s.profileBadge}>
          <Ionicons name="checkmark-circle" size={16} color={COLORS.green} />
          <Text style={s.badgeText}>فعال</Text>
        </View>
      </Pressable>

      {/* ── Fleet Overview Card ─────────────────────────────── */}
      <View style={s.card}>
        <View style={s.fleetRow}>
          <View style={[s.fleetIcon, { backgroundColor: COLORS.blueTint }]}>
            <Ionicons name="car-outline" size={24} color={COLORS.blue} />
          </View>
          <View style={s.fleetInfo}>
            <Text style={s.fleetTitle}>ناوگان فعال</Text>
            <Text style={s.fleetStatus}>به‌زودی</Text>
          </View>
        </View>
        <View style={s.fleetDivider} />
        <Text style={s.fleetHint}>
          پس از اتصال سامانه مدیریت ناوگان، اطلاعات وسایل نقلیه و رانندگان
          در اینجا نمایش داده خواهد شد.
        </Text>
      </View>

      {/* ── Quick Actions Grid ──────────────────────────────── */}
      <Text style={s.sectionTitle}>دسترسی سریع</Text>
      <View style={s.grid}>
        {ACTIONS.map((action) => {
          const isPressed = pressedCard === action.label;
          return (
            <Pressable
              key={action.label}
              style={({ pressed }) => [
                s.actionCard,
                pressed && s.actionCardPressed,
              ]}
              onPressIn={() => setPressedCard(action.label)}
              onPressOut={() => setPressedCard(null)}
              onPress={() => handleActionPress(action.label)}
            >
              <View
                style={[
                  s.actionIconCircle,
                  {
                    backgroundColor: `${action.color}14`,
                    borderRightColor: action.color,
                  },
                ]}
              >
                <Ionicons name={action.icon} size={22} color={action.color} />
              </View>
              <Text style={s.actionLabel}>{action.label}</Text>
              <Ionicons
                name="chevron-back"
                size={16}
                color={COLORS.gray}
                style={s.actionChevron}
              />
            </Pressable>
          );
        })}
      </View>

      {/* ── Coming Soon Section ─────────────────────────────── */}
      <View style={s.comingSoonCard}>
        <Ionicons name="rocket-outline" size={20} color={COLORS.amber} />
        <Text style={s.comingSoonText}>
          امکانات جدید شرکت حمل و نقل در آپدیت‌های آتی فعال خواهد شد.
        </Text>
      </View>
    </ScrollView>
  );
}

/* ─── Styles ────────────────────────────────────────────────── */

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space[5],
  },
  title: {
    fontSize: 20,
    fontFamily: font.bold,
    color: COLORS.textDark,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Cards */
  card: {
    backgroundColor: COLORS.white,
    borderRadius: radii.lg,
    padding: space[4],
    marginBottom: space[3],
    ...shadows.sm,
  },
  cardPressed: {
    opacity: 0.92,
  },

  /* Profile */
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  avatarCircle: {
    width: 56,
    height: 56,
    borderRadius: radii.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 16,
    fontFamily: font.bold,
    color: COLORS.textDark,
    textAlign: 'right',
  },
  profilePhone: {
    fontSize: 13,
    fontFamily: font.regular,
    color: COLORS.textMid,
    marginTop: 2,
    textAlign: 'right',
    direction: 'ltr' as const,
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: space[3],
    alignSelf: 'flex-start',
    backgroundColor: COLORS.greenTint,
    paddingHorizontal: space[2],
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: font.medium,
    color: COLORS.greenDark,
  },

  /* Fleet */
  fleetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  fleetIcon: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fleetInfo: {
    flex: 1,
  },
  fleetTitle: {
    fontSize: 15,
    fontFamily: font.bold,
    color: COLORS.textDark,
    textAlign: 'right',
  },
  fleetStatus: {
    fontSize: 13,
    fontFamily: font.medium,
    color: COLORS.amber,
    marginTop: 2,
    textAlign: 'right',
  },
  fleetDivider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: space[3],
  },
  fleetHint: {
    fontSize: 13,
    fontFamily: font.regular,
    color: COLORS.textMid,
    lineHeight: 20,
    textAlign: 'right',
  },

  /* Quick actions */
  sectionTitle: {
    fontSize: 15,
    fontFamily: font.bold,
    color: COLORS.textDark,
    marginBottom: space[3],
    marginTop: space[2],
    textAlign: 'right',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[3],
    marginBottom: space[4],
  },
  actionCard: {
    width: '48%' as any,
    backgroundColor: COLORS.white,
    borderRadius: radii.lg,
    padding: space[3],
    ...shadows.sm,
    minHeight: 88,
  },
  actionCardPressed: {
    opacity: 0.9,
  },
  actionIconCircle: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 3,
    marginBottom: space[2],
  },
  actionLabel: {
    fontSize: 13,
    fontFamily: font.medium,
    color: COLORS.textDark,
    textAlign: 'right',
  },
  actionChevron: {
    marginTop: space[1],
    alignSelf: 'flex-end',
  },

  /* Coming soon */
  comingSoonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: COLORS.amberTint,
    borderRadius: radii.lg,
    padding: space[4],
    borderRightWidth: 3,
    borderRightColor: COLORS.amber,
  },
  comingSoonText: {
    flex: 1,
    fontSize: 13,
    fontFamily: font.regular,
    color: COLORS.textMid,
    lineHeight: 20,
    textAlign: 'right',
  },
});
