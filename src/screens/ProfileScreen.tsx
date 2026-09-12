import React from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Typography, Box } from '../components/common/UI';
import { SiriusTheme } from '../constants/theme';

const ProfileScreen = () => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Typography variant="screenTitle">Profile</Typography>
        <Typography variant="secondary">Account Settings</Typography>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar} />
          <Typography variant="card">Ammar Muhammad</Typography>
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
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SiriusTheme.spacing.m,
    backgroundColor: SiriusTheme.colors.surface,
  },
});

export default ProfileScreen;
