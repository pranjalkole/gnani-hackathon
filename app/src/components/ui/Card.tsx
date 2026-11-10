import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii } from '@/theme';

type CardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Bordered surface card. Avoid nesting cards; use InsetPanel for inner rows. */
export function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Muted inset panel for rows inside a card. */
export function InsetPanel({ children, style }: CardProps) {
  return <View style={[styles.inset, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    padding: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
  },
  inset: {
    padding: 12,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
  },
});
