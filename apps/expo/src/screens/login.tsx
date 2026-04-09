import { View, Text, StyleSheet, Alert } from 'react-native';
import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { colors, fontSize, spacing } from '../lib/theme';

type LoginState =
  | { step: 'email' }
  | { step: 'sending' }
  | { step: 'sent'; email: string }
  | { step: 'error'; message: string };

export function LoginScreen() {
  const [loginState, setLoginState] = useState<LoginState>({ step: 'email' });
  const [email, setEmail] = useState('');

  const sendMagicLink = useCallback(async () => {
    if (!email.trim()) return;
    setLoginState({ step: 'sending' });

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });

    if (error) {
      setLoginState({ step: 'error', message: error.message });
      return;
    }

    setLoginState({ step: 'sent', email });
  }, [email]);

  if (loginState.step === 'sent') {
    return (
      <View style={styles.screen}>
        <Card>
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
          </CardHeader>
          <CardContent>
            <Text style={styles.mutedText}>
              Magic link sent to <Text style={styles.bold}>{loginState.email}</Text>. Click the link to sign in.
            </Text>
          </CardContent>
        </Card>
      </View>
    );
  }

  const isSending = loginState.step === 'sending';

  return (
    <View style={styles.screen}>
      <Card>
        <CardHeader>
          <CardTitle>HouseOps</CardTitle>
        </CardHeader>
        <CardContent>
          <View style={styles.form}>
            <Input
              placeholder="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              disabled={isSending}
              onSubmitEditing={sendMagicLink}
              returnKeyType="send"
            />
            {loginState.step === 'error' && (
              <Text style={styles.errorText}>{loginState.message}</Text>
            )}
            <Button onPress={sendMagicLink} disabled={isSending}>
              {isSending ? 'Sending...' : 'Send magic link'}
            </Button>
          </View>
        </CardContent>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  form: { gap: spacing.md },
  mutedText: { fontSize: fontSize.sm, color: colors.mutedForeground },
  bold: { fontWeight: '700' },
  errorText: { fontSize: fontSize.sm, color: colors.destructive },
});
