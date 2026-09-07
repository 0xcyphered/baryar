import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { COLORS, font, space } from '../../theme';

interface Props {
  title: string;
  subtitle?: string;
  /** Right-aligned action text. Pressable wrapper is the caller's job. */
  action?: string;
  style?: object;
}

/**
 * Consistent section header used above card lists and grouped forms.
 * RTL: title on right, optional action on left.
 */
export default function SectionHeader({ title, subtitle, action, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action ? <Text style={styles.action}>{action}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    marginBottom: space[2],
  },
  textWrap: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontFamily: font.bold,
    color: COLORS.textDark,
  },
  subtitle: {
    fontSize: 12,
    fontFamily: font.regular,
    color: COLORS.textMid,
    marginTop: 2,
  },
  action: {
    fontSize: 13,
    fontFamily: font.medium,
    color: COLORS.blue,
  },
});
