import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type ScanStatePanelProps = {
  icon: IconName;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  footnote?: ReactNode;
};

export function ScanStatePanel({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  footnote,
}: ScanStatePanelProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name={icon} size={23} color={colors.forest} />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>

        {footnote ? (
          <View style={styles.footnote}>
            <Ionicons name="information-circle-outline" size={14} color={colors.inkSoft} />
            <Text style={styles.footnoteText}>{footnote}</Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
          <Ionicons name="arrow-forward" size={15} color={colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 32,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
  },
  icon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sage,
    borderRadius: 15,
  },
  title: {
    marginTop: 18,
    color: colors.ink,
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  body: {
    marginTop: 8,
    color: colors.inkSoft,
    fontSize: 12.5,
    lineHeight: 20,
  },
  footnote: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: 11,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.sm,
  },
  footnoteText: {
    flex: 1,
    color: colors.inkSoft,
    fontSize: 11.5,
    lineHeight: 17,
  },
  action: {
    minHeight: 48,
    alignSelf: 'stretch',
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    backgroundColor: colors.forest,
    borderRadius: radii.sm,
  },
  actionText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
  },
});
