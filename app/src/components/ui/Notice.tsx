import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

type NoticeProps = {
  tone?: NoticeTone;
  icon?: IconName;
  title?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

const TONES: Record<
  NoticeTone,
  { backgroundColor: string; color: string; icon: IconName }
> = {
  info: { backgroundColor: colors.infoSoft, color: colors.info, icon: 'information-circle-outline' },
  success: {
    backgroundColor: colors.successSoft,
    color: colors.success,
    icon: 'checkmark-circle-outline',
  },
  warning: {
    backgroundColor: colors.warningSoft,
    color: colors.warning,
    icon: 'alert-circle-outline',
  },
  danger: {
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    icon: 'alert-circle-outline',
  },
};

/** Inline message with a semantic tone. */
export function Notice({ tone = 'info', icon, title, children, style }: NoticeProps) {
  const palette = TONES[tone];

  return (
    <View style={[styles.notice, { backgroundColor: palette.backgroundColor }, style]}>
      <Ionicons name={icon ?? palette.icon} size={17} color={palette.color} />
      <View style={styles.copy}>
        {title ? <Text style={[styles.title, { color: palette.color }]}>{title}</Text> : null}
        <View>
          {typeof children === 'string' ? (
            <Text style={styles.body}>{children}</Text>
          ) : (
            children
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 12,
    borderRadius: radii.sm,
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
  },
  body: {
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
});
