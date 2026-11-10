import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Button } from '@/components/ui/Button';
import { colors, radii } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type StateCardProps = {
  icon?: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'danger';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Loading, empty and error state with one clear action. */
export function StateCard({
  icon = 'file-tray-outline',
  title,
  body,
  actionLabel,
  onAction,
  tone = 'neutral',
  loading = false,
  style,
}: StateCardProps) {
  return (
    <View style={[styles.card, style]} accessibilityLiveRegion="polite">
      <View style={[styles.icon, tone === 'danger' && styles.iconDanger]}>
        {loading ? (
          <ActivityIndicator size="small" color={colors.forest} />
        ) : (
          <Ionicons
            name={icon}
            size={22}
            color={tone === 'danger' ? colors.danger : colors.forest}
          />
        )}
      </View>

      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>

      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="secondary"
          icon="refresh-outline"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 20,
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.lg,
  },
  icon: {
    width: 48,
    height: 48,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sage,
    borderRadius: 15,
  },
  iconDanger: {
    backgroundColor: colors.dangerSoft,
  },
  title: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    maxWidth: 300,
    marginTop: 6,
    color: colors.inkSoft,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  action: {
    marginTop: 16,
    alignSelf: 'stretch',
  },
});
