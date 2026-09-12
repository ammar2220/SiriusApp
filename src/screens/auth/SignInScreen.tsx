import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Typography, Box, Button } from '../../components/common/UI';
import { SiriusTheme } from '../../constants/theme';

interface SignInProps {
  onSignIn: () => void;
  onNavigateToSignUp: () => void;
}

const SignInScreen = ({ onSignIn, onNavigateToSignUp }: SignInProps) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    setIsLoading(true);
    // Mock delay for premium feel
    await new Promise(resolve => setTimeout(() => resolve(true), 1500));
    setIsLoading(false);
    onSignIn();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.logoPlaceholder}>
            <Typography variant="screenTitle" style={styles.logoText}>SIRIUS</Typography>
          </View>
          <Typography variant="body" style={styles.subtitle}>
            Welcome back to your smart home.
          </Typography>
        </View>

        <View style={styles.form}>
          <Box style={styles.inputWrapper}>
            <Typography variant="secondary" style={styles.label}>Email</Typography>
            <TouchableOpacity style={styles.input} onPress={() => {}}>
              <Typography variant="body">{email || 'email@example.com'}</Typography>
            </TouchableOpacity>
          </Box>

          <Box style={styles.inputWrapper}>
            <Typography variant="secondary" style={styles.label}>Password</Typography>
            <TouchableOpacity style={styles.input} onPress={() => {}}>
              <Typography variant="body">••••••••</Typography>
            </TouchableOpacity>
          </Box>

          <Button
            title="Sign In"
            onPress={handleSignIn}
            loading={isLoading}
            style={styles.signInBtn}
          />
        </View>

        <TouchableOpacity style={styles.footer} onPress={onNavigateToSignUp}>
          <Typography variant="body">Don't have an account? </Typography>
          <Typography variant="body" style={styles.link}>Sign Up</Typography>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SiriusTheme.colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: SiriusTheme.spacing.l,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: SiriusTheme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  logoText: {
    color: '#fff',
    fontSize: 20,
    letterSpacing: 2,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.6,
    marginTop: 8,
  },
  form: {
    gap: 24,
    marginBottom: 32,
  },
  inputWrapper: {
    padding: 0,
    backgroundColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
  },
  label: {
    marginBottom: 8,
    marginLeft: 4,
  },
  input: {
    backgroundColor: SiriusTheme.colors.surface,
    borderRadius: SiriusTheme.borderRadius.m,
    padding: SiriusTheme.spacing.m,
    borderWidth: 1,
    borderColor: SiriusTheme.colors.disabled,
  },
  signInBtn: {
    marginTop: 16,
    height: 56,
    borderRadius: SiriusTheme.borderRadius.m,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  link: {
    color: SiriusTheme.colors.primary,
    fontWeight: 'bold',
  },
});

export default SignInScreen;
