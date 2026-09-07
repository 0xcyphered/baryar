import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { hapticLight, hapticMedium } from '../utils/haptics';
import { APP_ROLE_ORDER, ROLE_META } from '../utils/constants';
import type { AppRole } from '../types';
import { COLORS } from '../theme';

interface Props {
  /** Called after the choice is persisted. The navigator flips on its own
   * (context state change), so this can stay empty — kept for future side
   * effects. */
  onDone: () => void;
}

/**
 * Plan 040: one-time post-login role selection for the three mobile user
 * models (roadmap §1 user / §2 cargo owner / §3 driver). Admin is web-only
 * and intentionally absent. The choice is a client-side experience mode —
 * no backend role is mutated.
 */
export default function RoleChoiceScreen({ onDone }: Props) {
  const { setActiveRole } = useAuth();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<AppRole | null>(null);
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!selected || saving) return;
    setSaving(true);
    hapticMedium();
    try {
      await setActiveRole(selected);
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
      <ScrollView contentContainerStyle={styles.scroll} bounces={false}>
        <Text style={styles.title}>به بریار خوش آمدید</Text>
        <Text style={styles.subtitle}>می‌خواهید چطور از بریار استفاده کنید؟</Text>

        {APP_ROLE_ORDER.map((role) => {
          const meta = ROLE_META[role];
          const isSelected = selected === role;
          return (
            <Pressable
              key={role}
              style={({ pressed }) => [
                styles.card,
                isSelected
                  ? { borderColor: meta.color, backgroundColor: meta.tint }
                  : { borderColor: COLORS.white, backgroundColor: COLORS.white },
                pressed && !isSelected && { opacity: 0.9 },
              ]}
              onPress={() => {
                hapticLight();
                setSelected(role);
              }}
            >
              <View style={[styles.iconCircle, { backgroundColor: meta.tint }]}>
                <Ionicons name={meta.icon as never} size={26} color={meta.color} />
              </View>
              <View style={styles.cardTextWrap}>
                <Text style={styles.cardTitle}>{meta.label}</Text>
                <Text style={styles.cardTagline}>{meta.tagline}</Text>
              </View>
              {isSelected ? (
                <Ionicons name="checkmark-circle" size={22} color={meta.color} />
              ) : (
                <Ionicons name="ellipse-outline" size={22} color={COLORS.gray} />
              )}
            </Pressable>
          );
        })}

        <Text style={styles.footerHint}>بعداً می‌توانید از پروفایل تغییر دهید</Text>
      </ScrollView>

      <Pressable
        style={({ pressed }) => [
          styles.cta,
          (!selected || saving) && styles.ctaDisabled,
          pressed && selected && !saving && { opacity: 0.92 },
        ]}
        disabled={!selected || saving}
        onPress={handleContinue}
      >
        {saving ? (
          <ActivityIndicator color={COLORS.white} />
        ) : (
          <Text style={styles.ctaText}>ادامه</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    paddingHorizontal: 20,
  },
  scroll: {
    flexGrow: 1,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
    textAlign: 'center',
    marginTop: 8,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 28,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 14,
    borderWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextWrap: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.textDark,
  },
  cardTagline: {
    fontSize: 13,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.textMid,
    marginTop: 3,
  },
  footerHint: {
    fontSize: 11,
    fontFamily: 'Vazirmatn_400Regular',
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 10,
  },
  cta: {
    backgroundColor: COLORS.blue,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  ctaDisabled: {
    backgroundColor: COLORS.grayLight,
  },
  ctaText: {
    fontSize: 16,
    fontFamily: 'Vazirmatn_700Bold',
    color: COLORS.white,
  },
});
