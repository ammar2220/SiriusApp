import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Typography, Box, Button } from '../../components/common/UI';
import { SiriusTheme } from '../../constants/theme';

interface SignUpProps {
  onSignUp: () => void;
  onNavigateToSignIn: () => void;
}

const SignUpScreen = ({ onSignUp, onNavigateToSignIn }: SignUpProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleSignUp = async () => {
    setIsLoading(true);
    await new Promise(resolve => setTimeout(() => resolve(true), 1500));
    setIsLoading(false);
    onSignUp();
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
            Join the premium smart home experience.
          </Typography>
        </View>

        <View style={styles.form}>
          <Box style={styles.inputWrapper}>
            <Typography variant="secondary" style={styles.label}>Full Name</Typography>
            <TouchableOpacity style={styles.input} onPress={() => {}}>
              <Typography variant="body">Ammar Muhammad</Typography>
            </TouchableOpacity>
          </Box>

          <Box style={styles.inputWrapper}>
            <Typography variant="secondary" style={styles.label}>Email</Typography>
            <TouchableOpacity style={styles.input} onPress={() => {}}>
              <Typography variant="body">email@example.com</Typography>
            </TouchableOpacity>
          </Box>

          <Box style={styles.inputWrapper}>
            <Typography variant="secondary" style={styles.label}>Password</Typography>
            <TouchableOpacity style={styles.input} onPress={() => {}}>
              <Typography variant="body">••••••••</Typography>
            </TouchableOpacity>
          </Box>

          <Button
            title="Create Account"
            onPress={handleSignUp}
            loading={isLoading}
            style={styles.signUpBtn}
          />
        </View>

        <TouchableOpacity style={styles.footer} onPress={onNavigateToSignIn}>
          <Typography variant="body">Already have an account? </Typography>
          <Typography variant="body" style={styles.link}>Sign In</Typography>
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
  signUpBtn: {
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

export default SignUpScreen;
