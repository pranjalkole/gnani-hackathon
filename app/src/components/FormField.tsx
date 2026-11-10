import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { FieldLabel } from '@/components/ui/FieldLabel';
import { colors, radii } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type FormFieldProps = TextInputProps & {
  label: string;
  icon: IconName;
  error?: string;
  isPassword?: boolean;
  onVoicePress?: () => void;
  voiceState?: 'idle' | 'recording' | 'transcribing' | 'disabled';
};

export function FormField({
  label,
  icon,
  error,
  isPassword = false,
  onVoicePress,
  voiceState = 'idle',
  accessibilityLabel,
  onFocus,
  onBlur,
  ...inputProps
}: FormFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const voiceDisabled =
    voiceState === 'disabled' ||
    voiceState === 'recording' ||
    voiceState === 'transcribing';

  return (
    <View>
      <FieldLabel>{label}</FieldLabel>

      <View
        // Keep the native view stable when the focus style changes.
        // Otherwise Fabric unflattens the tree and the input loses focus.
        collapsable={false}
        style={[
          styles.inputShell,
          isFocused && styles.inputShellFocused,
          error ? styles.inputShellError : null,
        ]}
      >
        <Ionicons
          name={icon}
          size={19}
          color={isFocused ? colors.forest : colors.inkFaint}
        />

        <TextInput
          {...inputProps}
          accessibilityLabel={accessibilityLabel ?? label}
          style={styles.input}
          placeholderTextColor={colors.inkFaint}
          selectionColor={colors.forest}
          secureTextEntry={isPassword && !isPasswordVisible}
          onFocus={(event) => {
            setIsFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setIsFocused(false);
            onBlur?.(event);
          }}
        />

        {isPassword ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
            hitSlop={10}
            onPress={() => setIsPasswordVisible((visible) => !visible)}
            style={styles.eyeButton}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={colors.inkSoft}
            />
          </Pressable>
        ) : null}

        {onVoicePress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Dictate ${label.toLowerCase()}`}
            accessibilityState={{ disabled: voiceDisabled, busy: voiceState === 'transcribing' }}
            disabled={voiceDisabled}
            hitSlop={8}
            onPress={onVoicePress}
            style={({ pressed }) => [
              styles.voiceButton,
              voiceState === 'recording' && styles.voiceButtonRecording,
              voiceDisabled && styles.voiceButtonDisabled,
              pressed && !voiceDisabled && styles.pressed,
            ]}
          >
            {voiceState === 'transcribing' ? (
              <ActivityIndicator size="small" color={colors.forest} />
            ) : (
              <Ionicons
                name={voiceState === 'disabled' ? 'mic-off-outline' : 'mic-outline'}
                size={18}
                color={voiceState === 'disabled' ? colors.inkFaint : colors.forest}
              />
            )}
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputShell: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.sm,
  },
  inputShellFocused: {
    borderColor: colors.forest,
  },
  inputShellError: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft,
  },
  input: {
    flex: 1,
    minHeight: 50,
    paddingVertical: 12,
    color: colors.ink,
    fontSize: 15,
  },
  eyeButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sage,
    borderRadius: 12,
  },
  voiceButtonRecording: {
    backgroundColor: colors.accentSoft,
  },
  voiceButtonDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  error: {
    marginTop: 7,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.8,
  },
});
