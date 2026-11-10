import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  hint?: string;
};

/** Sentence-case section heading with an optional hint on the right. */
export function SectionHeader({ title, subtitle, hint }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  subtitle: {
    marginTop: 3,
    color: colors.inkSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  hint: {
    color: colors.inkFaint,
    fontSize: 12,
    fontWeight: '600',
  },
});
