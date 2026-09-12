import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Text,
  TextInput,
} from 'react-native';
import { Typography, Box, Button, SiriusModal } from '../../components/common/UI';
import { SiriusTheme } from '../../constants/theme';
import deviceRepository from '../../api/repositories/CompositeDeviceRepository';
import { Home } from '../../types/home';

interface DashboardProps {
  onNavigateToHome: (homeId: string) => void;
}

const HomeCard = ({ home, index, onNavigateToHome }: { home: Home, index: number, onNavigateToHome: (id: string) => void }) => {
  const [stats, setStats] = useState({ totalDevices: 0, activeDevices: 0 });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await deviceRepository.getHomeStats(home.id);
        setStats(data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    loadStats();
  }, [home.id]);

  if (isLoading) {
    return (
      <View style={[styles.homeCard, index === 0 && styles.activeHomeCard, { justifyContent: 'center', height: 80 }]}>
        <ActivityIndicator color={SiriusTheme.colors.primary} />
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[
        styles.homeCard,
        index === 0 && styles.activeHomeCard
      ]}
      onPress={() => onNavigateToHome(home.id)}
    >
      <View style={styles.homeIcon}>
        <Text style={{ fontSize: 24 }}>🏠</Text>
      </View>
      <View style={styles.homeInfo}>
        <Typography variant="card">{home.name}</Typography>
        <Typography variant="secondary">
          {home.rooms.length} Rooms · {stats.totalDevices} Devices, {stats.activeDevices} devices ON
        </Typography>
      </View>
      <TouchableOpacity style={styles.chevron}>
        <Text style={{ color: SiriusTheme.colors.textSecondary }}>→</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

const DashboardScreen = ({ onNavigateToHome }: DashboardProps) => {
  const [homes, setHomes] = useState<Home[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddHomeModalVisible, setIsAddHomeModalVisible] = useState(false);
  const [newHomeName, setNewHomeName] = useState('');

  useEffect(() => {
    loadHomes();
  }, []);

  const loadHomes = async () => {
    setIsLoading(true);
    try {
      const data = await deviceRepository.getHomes();
      setHomes(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddHome = async () => {
    if (!newHomeName.trim()) return;
    try {
      await deviceRepository.addHome(newHomeName);
      setNewHomeName('');
      setIsAddHomeModalVisible(false);
      await loadHomes();
    } catch (e) {
      console.error(e);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={SiriusTheme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <View>
          <Typography variant="screenTitle">Hi Ammar</Typography>
          <Typography variant="secondary">Welcome Home</Typography>
        </View>
        <TouchableOpacity style={styles.notificationBtn}>
           <Text style={{ fontSize: 24 }}>🔔</Text>
        </TouchableOpacity>
      </View>

      <Typography variant="section" style={styles.sectionTitle}>My Homes</Typography>

      <View style={styles.homeList}>
        {homes.map((home, index) => (
          <HomeCard
            key={home.id}
            home={home}
            index={index}
            onNavigateToHome={onNavigateToHome}
          />
        ))}
      </View>

      <Button
        title="+ Add Home"
        onPress={() => setIsAddHomeModalVisible(true)}
        variant="secondary"
        style={styles.addHomeBtn}
      />

      <SiriusModal
        isVisible={isAddHomeModalVisible}
        onClose={() => setIsAddHomeModalVisible(false)}
        title="Add New Home"
      >
        <View style={styles.modalForm}>
          <Typography variant="secondary" style={styles.label}>Home Name</Typography>
          <TextInput
            style={styles.input}
            placeholder="e.g. My Dream Home"
            value={newHomeName}
            onChangeText={setNewHomeName}
            placeholderTextColor={SiriusTheme.colors.disabled}
          />
          <Button
            title="Save Home"
            onPress={handleAddHome}
            style={{ marginTop: 24 }}
          />
        </View>
      </SiriusModal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SiriusTheme.colors.background,
  },
  contentContainer: {
    padding: SiriusTheme.spacing.l,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: SiriusTheme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  notificationBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SiriusTheme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  homeList: {
    gap: 16,
    marginBottom: 32,
  },
  homeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SiriusTheme.colors.surface,
    borderRadius: SiriusTheme.borderRadius.l,
    padding: SiriusTheme.spacing.m,
    borderWidth: 2,
    borderColor: 'transparent',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  activeHomeCard: {
    borderColor: SiriusTheme.colors.primary,
  },
  homeIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: SiriusTheme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  homeInfo: {
    flex: 1,
  },
  chevron: {
    padding: 8,
  },
  addHomeBtn: {
    width: '100%',
    height: 56,
    borderRadius: SiriusTheme.borderRadius.m,
    borderWidth: 1,
    borderColor: SiriusTheme.colors.primary,
  },
  modalForm: {
    gap: 12,
  },
  label: {
    marginBottom: 4,
  },
  input: {
    backgroundColor: SiriusTheme.colors.surface,
    borderRadius: SiriusTheme.borderRadius.m,
    padding: SiriusTheme.spacing.m,
    borderWidth: 1,
    borderColor: SiriusTheme.colors.disabled,
    color: SiriusTheme.colors.textPrimary,
  },
});

export default DashboardScreen;
