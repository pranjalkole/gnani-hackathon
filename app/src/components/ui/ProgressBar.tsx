import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii } from '@/theme';

type ProgressBarProps = {
  receivedPercent: number;
  damagedPercent?: number;
  tone?: 'light' | 'dark';
  height?: number;
  style?: StyleProp<ViewStyle>;
};

function clamp(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

/** Received/damaged progress bar used by site and order summaries. */
export function ProgressBar({
  receivedPercent,
  damagedPercent = 0,
  tone = 'light',
  height = 7,
  style,
}: ProgressBarProps) {
  const received = clamp(receivedPercent);
  const damaged = Math.min(clamp(damagedPercent), Math.max(0, 100 - received));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(received) }}
      style={[
        styles.track,
        { height },
        tone === 'dark' ? styles.trackDark : styles.trackLight,
        style,
      ]}
    >
      <View
        style={[
          styles.segment,
          { width: `${received}%`, backgroundColor: tone === 'dark' ? colors.accent : colors.forest },
        ]}
      />
      <View
        style={[
          styles.segment,
          {
            width: `${damaged}%`,
            backgroundColor: tone === 'dark' ? colors.damagedSegment : colors.danger,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  trackLight: {
    backgroundColor: colors.surfaceMuted,
  },
  trackDark: {
    backgroundColor: colors.onForestOverlay,
  },
  segment: {
    height: '100%',
  },
});
