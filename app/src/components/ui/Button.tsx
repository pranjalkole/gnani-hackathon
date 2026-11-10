import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radii } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconName;
  trailingIcon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** Shared button with consistent pressed, disabled and busy states. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  trailingIcon,
  disabled = false,
  busy = false,
  accessibilityLabel,
  style,
}: ButtonProps) {
  const isDisabled = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        isDisabled && variant === 'primary' && styles.primaryDisabled,
        isDisabled && variant !== 'primary' && styles.otherDisabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.white : colors.forest}
        />
      ) : icon ? (
        <Ionicons
          name={icon}
          size={17}
          color={variant === 'primary' ? colors.white : colors.forest}
        />
      ) : null}

      <Text
        style={[
          styles.label,
          variant === 'primary' ? styles.primaryLabel : styles.secondaryLabel,
          isDisabled && variant === 'primary' && styles.primaryLabelDisabled,
        ]}
      >
        {label}
      </Text>

      {trailingIcon && !busy ? (
        <Ionicons
          name={trailingIcon}
          size={17}
          color={variant === 'primary' ? colors.white : colors.forest}
        />
      ) : null}
    </Pressable>
  );
}

type IconButtonProps = {
  icon: IconName;
  onPress: () => void;
  accessibilityLabel: string;
  tone?: 'surface' | 'sage';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Square icon-only button that always meets the 44x44 touch target. */
export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  tone = 'surface',
  disabled = false,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        tone === 'sage' && styles.iconButtonSage,
        disabled && styles.otherDisabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <Ionicons name={icon} size={19} color={colors.forest} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: radii.sm,
  },
  primary: {
    backgroundColor: colors.forest,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  primaryDisabled: {
    backgroundColor: colors.sage,
  },
  otherDisabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
  },
  primaryLabel: {
    color: colors.white,
  },
  primaryLabelDisabled: {
    color: colors.inkSoft,
  },
  secondaryLabel: {
    color: colors.forest,
  },
  pressed: {
    opacity: 0.85,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
  },
  iconButtonSage: {
    backgroundColor: colors.sage,
    borderColor: colors.sage,
  },
});
