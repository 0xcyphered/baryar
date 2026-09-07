import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, font, radii, space } from '../../theme';

interface Props {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'md' | 'lg';
  fullWidth?: boolean;
}

/**
 * Primary CTA button with loading spinner. Supports primary/secondary/danger
 * variants. RTL text is auto-centered.
 */
export default function Button({
  label,
  onPress,
  loading = false,
  disabled = false,
  variant = 'primary',
  size = 'lg',
  fullWidth = true,
}: Props) {
  const bgMap = {
    primary: COLORS.blue,
    secondary: COLORS.white,
    danger: COLORS.red,
  };
  const textMap = {
    primary: COLORS.white,
    secondary: COLORS.blue,
    danger: COLORS.white,
  };
  const borderMap = {
    primary: 'transparent',
    secondary: COLORS.blue,
    danger: COLORS.red,
  };

  const isLarge = size === 'lg';
  const isActive = !loading && !disabled && onPress;

  return (
    <Pressable
      style={({ pressed }) => [
        btnStyles.base,
        fullWidth && { width: '100%' },
        isLarge ? btnStyles.lg : btnStyles.md,
        {
          backgroundColor: bgMap[variant],
          borderWidth: variant === 'secondary' ? 1.5 : 0,
          borderColor: borderMap[variant],
        },
        (disabled || loading) && { opacity: 0.55 },
        pressed && isActive && { opacity: 0.92, transform: [{ scale: 0.98 }] },
      ]}
      onPress={isActive ? onPress : undefined}
      disabled={!isActive}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? COLORS.blue : COLORS.white} size="small" />
      ) : (
        <Text style={[btnStyles.label, { color: textMap[variant] }, !isLarge && btnStyles.labelSm]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const btnStyles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.lg,
  },
  lg: {
    height: 52,
    paddingHorizontal: space[6],
  },
  md: {
    height: 42,
    paddingHorizontal: space[5],
  },
  label: {
    fontSize: 16,
    fontFamily: font.bold,
    lineHeight: 22,
  },
  labelSm: {
    fontSize: 14,
    fontFamily: font.medium,
  },
});
