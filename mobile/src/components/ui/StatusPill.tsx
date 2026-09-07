import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { font } from '../../theme';

interface Props {
  label: string;
  color: string;
  /** Optional tint background color (e.g. 'rgba(59,130,246,0.10)'). Falls back to 15% alpha of `color`. */
  tint?: string;
  size?: 'sm' | 'md';
}

/**
 * Colored status pill. The caller provides the label and the full color.
 * A tint background is derived automatically if not supplied.
 */
export default function StatusPill({ label, color, tint, size = 'md' }: Props) {
  const bgColor = tint || `${color}1a`; // 10% alpha fallback
  const isSmall = size === 'sm';

  return (
    <View style={[pillStyles.badge, { backgroundColor: bgColor }, isSmall && pillStyles.badgeSm]}>
      <Text
        style={[pillStyles.text, { color }, isSmall && pillStyles.textSm]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const pillStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  text: {
    fontSize: 12,
    fontFamily: font.medium,
  },
  textSm: {
    fontSize: 11,
  },
});
