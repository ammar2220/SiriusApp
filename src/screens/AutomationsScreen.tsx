import React from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Typography, Box } from '../components/common/UI';
import { SiriusTheme } from '../constants/theme';

const AutomationsScreen = () => {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Typography variant="screenTitle">Automations</Typography>
        <Typography variant="secondary">Smart Routines</Typography>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Box elevation="light" style={styles.placeholderCard}>
          <Typography variant="card">No automations yet</Typography>
          <Typography variant="secondary" style={{ textAlign: 'center', marginTop: 8 }}>
            Create your first routine to automate your home.
          </Typography>
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
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 1,
  },
  placeholderCard: {
    width: '100%',
    alignItems: 'center',
    padding: SiriusTheme.spacing.xl,
    borderRadius: SiriusTheme.borderRadius.xl,
  },
});

export default AutomationsScreen;
