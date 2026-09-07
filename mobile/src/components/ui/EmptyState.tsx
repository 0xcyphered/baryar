import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, font, space } from '../../theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Reusable empty state with large icon, title, message, and optional
 * CTA button. Used when lists have no items, errors are cleared, etc.
 */
export default function EmptyState({ icon, title, message, actionLabel, onAction }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={40} color={COLORS.gray} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable style={({ pressed }) => [styles.button, pressed && { opacity: 0.9 }]} onPress={onAction}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: space[12],
    paddingHorizontal: space[8],
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.grayLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[4],
  },
  title: {
    fontSize: 16,
    fontFamily: font.bold,
    color: COLORS.textDark,
    textAlign: 'center',
    marginBottom: space[1],
  },
  message: {
    fontSize: 13,
    fontFamily: font.regular,
    color: COLORS.textMid,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: space[4],
  },
  button: {
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  buttonText: {
    fontSize: 14,
    fontFamily: font.bold,
    color: COLORS.white,
  },
});
