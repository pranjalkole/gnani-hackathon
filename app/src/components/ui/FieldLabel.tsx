import { StyleSheet, Text } from 'react-native';

import { colors } from '@/theme';

type FieldLabelProps = {
  children: string;
  hint?: string;
};

/** Shared label styling for inputs. */
export function FieldLabel({ children, hint }: FieldLabelProps) {
  return (
    <Text style={styles.label}>
      {children}
      {hint ? <Text style={styles.hint}> · {hint}</Text> : null}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: 8,
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  hint: {
    color: colors.inkFaint,
    fontWeight: '500',
  },
});
