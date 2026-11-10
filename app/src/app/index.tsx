import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { FormField } from '@/components/FormField';
import { RoleSelector, roleLabels, type UserRole } from '@/components/RoleSelector';
import { BrandMark, Screen } from '@/components/ui';
import { colors, radii } from '@/theme';

type FormErrors = {
  identifier?: string;
  password?: string;
};

export default function LoginScreen() {
  const router = useRouter();

  const [role, setRole] = useState<UserRole>('worker');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});

  const validate = () => {
    const nextErrors: FormErrors = {};
    const trimmedIdentifier = identifier.trim();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedIdentifier);
    const digitsOnly = trimmedIdentifier.replace(/\D/g, '');
    const isPhone =
      /^[+()\d\s.-]+$/.test(trimmedIdentifier) &&
      digitsOnly.length >= 7 &&
      digitsOnly.length <= 15;

    if (!trimmedIdentifier) {
      nextErrors.identifier = 'Enter your email address or phone number.';
    } else if (!isEmail && !isPhone) {
      nextErrors.identifier = 'Enter a valid email address or phone number.';
    }

    if (!password) {
      nextErrors.password = 'Enter your password.';
    } else if (password.length < 6) {
      nextErrors.password = 'Password must be at least 6 characters.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSignIn = () => {
    if (!validate()) {
      return;
    }

    Keyboard.dismiss();

    // Replace this with the app's authentication request.
    if (role === 'worker') {
      router.replace({
        pathname: '/worker-dashboard',
        params: { identifier: identifier.trim() },
      });
      return;
    }

    router.replace({
      pathname: '/supervisor-dashboard',
      params: { identifier: identifier.trim() },
    });
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.brandRow}>
              <BrandMark />
            </View>

            <View style={styles.hero}>
              <Text style={styles.title}>Sign in</Text>
              <Text style={styles.subtitle}>
                Choose your role and enter your work account.
              </Text>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.sectionLabel}>Sign in as</Text>
              <View style={styles.roleSection}>
                <RoleSelector value={role} onChange={setRole} />
              </View>

              <View style={styles.fields}>
                <FormField
                  label="Email or phone"
                  icon="mail-outline"
                  value={identifier}
                  onChangeText={(value) => {
                    setIdentifier(value);
                    if (errors.identifier) {
                      setErrors((current) => ({ ...current, identifier: undefined }));
                    }
                  }}
                  placeholder="you@company.com"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  autoComplete="username"
                  textContentType="username"
                  returnKeyType="next"
                  error={errors.identifier}
                />

                <FormField
                  label="Password"
                  icon="lock-closed-outline"
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (errors.password) {
                      setErrors((current) => ({ ...current, password: undefined }));
                    }
                  }}
                  placeholder="Enter your password"
                  isPassword
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="current-password"
                  textContentType="password"
                  returnKeyType="done"
                  onSubmitEditing={handleSignIn}
                  error={errors.password}
                />
              </View>

              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: keepSignedIn }}
                aria-checked={keepSignedIn}
                accessibilityLabel="Keep me signed in"
                onPress={() => setKeepSignedIn((current) => !current)}
                style={styles.rememberRow}
              >
                <View
                  style={[styles.checkbox, keepSignedIn ? styles.checkboxChecked : null]}
                >
                  {keepSignedIn ? (
                    <Ionicons name="checkmark" size={13} color={colors.white} />
                  ) : null}
                </View>
                <Text style={styles.rememberText}>Keep me signed in</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Sign in as ${roleLabels[role]}`}
                onPress={handleSignIn}
                style={({ pressed }) => [styles.signInButton, pressed && styles.pressed]}
              >
                <Text style={styles.signInText}>Sign in as {roleLabels[role]}</Text>
                <Ionicons name="arrow-forward" size={17} color={colors.white} />
              </Pressable>
            </View>

            <Text style={styles.footerNote}>
              Need an account? Contact your site administrator.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  content: {
    width: '100%',
    maxWidth: 440,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  hero: {
    marginTop: 32,
  },
  title: {
    color: colors.ink,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  subtitle: {
    maxWidth: 320,
    marginTop: 6,
    color: colors.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  formSection: {
    marginTop: 26,
  },
  sectionLabel: {
    color: colors.inkSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  roleSection: {
    marginTop: 8,
  },
  fields: {
    marginTop: 18,
    gap: 14,
  },
  rememberRow: {
    minHeight: 44,
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    borderRadius: 5,
  },
  checkboxChecked: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  rememberText: {
    color: colors.inkSoft,
    fontSize: 13,
  },
  signInButton: {
    minHeight: 52,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    backgroundColor: colors.forest,
    borderRadius: radii.md,
  },
  pressed: {
    opacity: 0.86,
  },
  signInText: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  footerNote: {
    marginTop: 24,
    color: colors.inkFaint,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
