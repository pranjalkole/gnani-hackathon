import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/theme';

type BrandMarkProps = {
  compact?: boolean;
};

/** Shared Crewline logo lockup. */
export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <View style={styles.lockup}>
      <View style={[styles.logoMark, compact && styles.logoMarkCompact]}>
        <Ionicons name="layers-outline" size={compact ? 19 : 21} color={colors.white} />
        <View style={[styles.logoDot, compact && styles.logoDotCompact]} />
      </View>
      <Text style={[styles.brandName, compact && styles.brandNameCompact]}>Crewline</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoMark: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.forest,
    borderRadius: radii.md,
  },
  logoMarkCompact: {
    width: 36,
    height: 36,
  },
  logoDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 6,
    height: 6,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
  },
  logoDotCompact: {
    top: 6,
    right: 6,
    width: 5,
    height: 5,
  },
  brandName: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  brandNameCompact: {
    fontSize: 16,
  },
});
