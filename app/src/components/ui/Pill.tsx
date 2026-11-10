import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii } from '@/theme';

export type PillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

type PillProps = {
  label: string;
  tone?: PillTone;
  leading?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const TONES: Record<PillTone, { backgroundColor: string; color: string }> = {
  neutral: { backgroundColor: colors.surfaceMuted, color: colors.inkSoft },
  success: { backgroundColor: colors.successSoft, color: colors.success },
  warning: { backgroundColor: colors.warningSoft, color: colors.warning },
  danger: { backgroundColor: colors.dangerSoft, color: colors.danger },
  info: { backgroundColor: colors.infoSoft, color: colors.info },
  accent: { backgroundColor: colors.accentSoft, color: colors.ink },
};

/** Small readable status/filter pill. */
export function Pill({ label, tone = 'neutral', leading, style }: PillProps) {
  const palette = TONES[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.backgroundColor }, style]}>
      {leading}
      <Text style={[styles.text, { color: palette.color }]}>{label}</Text>
    </View>
  );
}

type StatusPillProps = {
  label: string;
  tone?: PillTone;
  style?: StyleProp<ViewStyle>;
};

/** Status pill with a leading state dot. */
export function StatusPill({ label, tone = 'neutral', style }: StatusPillProps) {
  const palette = TONES[tone];

  return (
    <Pill
      label={label}
      tone={tone}
      style={style}
      leading={<View style={[styles.dot, { backgroundColor: palette.color }]} />}
    />
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: radii.pill,
  },
});
