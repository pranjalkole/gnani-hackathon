import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '@/theme';

export type UserRole = 'worker' | 'supervisor';

type IconName = ComponentProps<typeof Ionicons>['name'];

type RoleOption = {
  id: UserRole;
  label: string;
  icon: IconName;
};

const ROLES: RoleOption[] = [
  { id: 'worker', label: 'Worker', icon: 'hammer-outline' },
  { id: 'supervisor', label: 'Supervisor', icon: 'people-outline' },
];

type RoleSelectorProps = {
  value: UserRole;
  onChange: (role: UserRole) => void;
};

export const roleLabels: Record<UserRole, string> = {
  worker: 'Worker',
  supervisor: 'Supervisor',
};

export function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Select user type"
      style={styles.group}
    >
      {ROLES.map((role) => {
        const isSelected = role.id === value;

        return (
          <Pressable
            key={role.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            aria-checked={isSelected}
            accessibilityLabel={role.label}
            onPress={() => onChange(role.id)}
            style={({ pressed }) => [
              styles.option,
              isSelected && styles.optionSelected,
              pressed && styles.optionPressed,
            ]}
          >
            <Ionicons
              name={role.icon}
              size={17}
              color={isSelected ? colors.white : colors.inkSoft}
            />
            <Text style={[styles.label, isSelected && styles.labelSelected]}>
              {role.label}
            </Text>
            {isSelected ? (
              <Ionicons name="checkmark" size={16} color={colors.accent} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    padding: 3,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
  },
  option: {
    minHeight: 48,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
  },
  optionSelected: {
    backgroundColor: colors.forest,
  },
  optionPressed: {
    opacity: 0.86,
  },
  label: {
    color: colors.inkSoft,
    fontSize: 14,
    fontWeight: '600',
  },
  labelSelected: {
    color: colors.white,
  },
});
