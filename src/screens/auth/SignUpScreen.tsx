import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  Alert,
  Image,
} from 'react-native';
import { Typography, Box, Button } from '../../components/common/UI';
import { SiriusTheme } from '../../constants/theme';
import AuthenticationService from '../../api/auth/AuthenticationService';

interface SignUpProps {
  onSignUp: () => void;
  onNavigateToSignIn: () => void;
}

const SignUpScreen = ({ onSignUp, onNavigateToSignIn }: SignUpProps) => {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignUp = async () => {
    if (!displayName || !email || !password || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);
    const result = await AuthenticationService.signUp(email, displayName, password);
    setIsLoading(false);

    if (result.success) {
      if (result.needsConfirmation) {
        Alert.alert(
          'Verify Your Email',
          'A confirmation link has been sent to your email. Please verify your account before signing in.',
          [{ text: 'OK', onPress: onNavigateToSignIn }]
        );
      } else {
        onSignUp();
      }
    } else {
      Alert.alert('Sign Up Failed', result.error || 'An unexpected error occurred');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../../assets/images/sirius_logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Typography variant="body" style={styles.subtitle}>
            Join the premium smart home experience.
          </Typography>
        </View>

        <View style={styles.form}>
          <Box style={styles.inputWrapper}>
            <Typography variant="secondary" style={styles.label}>Full Name</Typography>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="e.g. Ammar Muhammad"
              autoCapitalize="words"
            />
          </Box>

          <Box style={styles.inputWrapper}>
            <Typography variant="secondary" style={styles.label}>Email</Typography>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="email@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </Box>

          <Box style={styles.inputWrapper}>
            <Typography variant="secondary" style={styles.label}>Password</Typography>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
            />
          </Box>

          <Box style={styles.inputWrapper}>
            <Typography variant="secondary" style={styles.label}>Confirm Password</Typography>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="••••••••"
              secureTextEntry
            />
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
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: '#0C1C3E',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  logo: {
    width: '70%',
    height: '70%',
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
    color: SiriusTheme.colors.textPrimary,
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
