import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Typography, Box, Button } from '../components/common/UI';
import { SiriusTheme } from '../constants/theme';
import SessionManager from '../api/session/SessionManager';
import AuthenticationService from '../api/auth/AuthenticationService';


interface ProfileProps {
  onLogout: () => void;
}

const ProfileScreen = ({ onLogout }: ProfileProps) => {
  const [userName, setUserName] = useState('User');

  useEffect(() => {
    const loadUser = async () => {
      const session = await SessionManager.getSession();
      if (session) {
        setUserName(session.userName);
      }
    };
    loadUser();
  }, []);

  const handleLogout = async () => {
    Alert.alert('Logout', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          await AuthenticationService.signOut();
          onLogout();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Typography variant="screenTitle">Profile</Typography>
        <Typography variant="secondary">Account Settings</Typography>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar} />
          <Typography variant="card">{userName}</Typography>
          <Typography variant="secondary">Premium Member</Typography>
        </View>

        <Box elevation="light" style={styles.settingsList}>
          <View style={styles.settingItem}>
            <Typography variant="body">My Homes</Typography>
            <Typography variant="secondary">→</Typography>
          </View>
          <View style={styles.settingItem}>
            <Typography variant="body">Notification Settings</Typography>
            <Typography variant="secondary">→</Typography>
          </View>
          <View style={styles.settingItem}>
            <Typography variant="body">Security & Privacy</Typography>
            <Typography variant="secondary">→</Typography>
          </View>
          <View style={styles.settingItem}>
            <Typography variant="body">Help & Support</Typography>
            <Typography variant="secondary">→</Typography>
          </View>
        </Box>

        <Button
          title="Logout"
          onPress={handleLogout}
          style={styles.logoutBtn}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SiriusTheme.colors.background,
  },
  header: {
    padding: SiriusTheme.spacing.l,
    paddingTop: 40,
    marginBottom: 20,
  },
  content: {
    padding: SiriusTheme.spacing.l,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: SiriusTheme.colors.primaryLight,
    marginBottom: 16,
  },
  settingsList: {
    gap: 1,
    backgroundColor: SiriusTheme.colors.disabled,
    borderRadius: SiriusTheme.borderRadius.m,
    overflow: 'hidden',
    marginBottom: 24,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SiriusTheme.spacing.m,
    backgroundColor: SiriusTheme.colors.surface,
  },
  logoutBtn: {
    height: 56,
    borderRadius: SiriusTheme.borderRadius.m,
    backgroundColor: SiriusTheme.colors.error || '#FF3B30',
  },
});

export default ProfileScreen;
