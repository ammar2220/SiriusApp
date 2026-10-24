import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Text,
  TextInput,
  Alert,
} from 'react-native';
import { Typography, Box, Button, SiriusModal } from '../../components/common/UI';
import { SiriusTheme } from '../../constants/theme';
import deviceRepository from '../../api/repositories/CompositeDeviceRepository';
import SessionManager from '../../api/session/SessionManager';
import { Home } from '../../types/home';

interface DashboardProps {
  onNavigateToHome: (homeId: string) => void;
}

const HomeCard = ({ home, index, activeHomeId, onNavigateToHome, onManageHome }: {
  home: Home,
  index: number,
  activeHomeId: string | null,
  onNavigateToHome: (id: string) => void,
  onManageHome: (home: Home) => void
}) => {
  const [stats, setStats] = useState<{ totalDevices: number, activeDevices: number | null }>({ totalDevices: 0, activeDevices: null });
  const [isLoading, setIsLoading] = useState(true);
  const isActive = home.id === activeHomeId;


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
        isActive && styles.activeHomeCard
      ]}
      onPress={() => onNavigateToHome(home.id)}
    >
      <View style={styles.homeIcon}>
        <Text style={{ fontSize: 24 }}>🏠</Text>
      </View>
      <View style={styles.homeInfo}>
        <Typography variant="card">{home.name}</Typography>
        <Typography variant="secondary">
          {home.rooms.length} Rooms · {stats.totalDevices} Devices, {stats.activeDevices !== null ? `${stats.activeDevices} devices ON` : 'live state unavailable'}
        </Typography>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => onManageHome(home)}
        >
          <Text style={styles.actionText}>⚙️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chevron}>
          <Text style={{ color: SiriusTheme.colors.textSecondary }}>→</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

};

const DashboardScreen = ({ onNavigateToHome }: DashboardProps) => {
  const [homes, setHomes] = useState<Home[]>([]);
  const [activeHomeId, setActiveHomeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [isAddHomeModalVisible, setIsAddHomeModalVisible] = useState(false);
  const [newHomeName, setNewHomeName] = useState('');
  const [isManageModalVisible, setIsManageModalVisible] = useState(false);
  const [selectedHomeForManage, setSelectedHomeForManage] = useState<Home | null>(null);
  const [manageHomeName, setManageHomeName] = useState('');

  useEffect(() => {
    const initDashboard = async () => {
      setIsLoading(true);
      try {
        // Run these in parallel for faster load
        const [homesData, session] = await Promise.all([
          deviceRepository.getHomes(),
          SessionManager.getSession()
        ]);

        setHomes(homesData);
        setActiveHomeId(session?.activeHomeId ?? null);

        if (session?.userName) {
          console.log('[Dashboard] Setting userName to:', session.userName);
          setUserName(session.userName);
        } else {
          console.warn('[Dashboard] Session found but userName is missing');
        }
      } catch (e) {
        console.error('Dashboard init failed:', e);
      } finally {
        setIsLoading(false);
      }
    };
    initDashboard();
  }, []);


  useEffect(() => {
    // Removed duplicate loadHomes() call here as it's now handled in initDashboard
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
      const newHome = await deviceRepository.addHome(newHomeName);
      setNewHomeName('');
      setIsAddHomeModalVisible(false);
      await loadHomes();
      onNavigateToHome(newHome.id);
    } catch (e: any) {
      console.error(e);
      const errorMessage = e.message || 'Unknown error';
      const details = e.details || 'No additional details provided';
      const hint = e.hint || 'No hint provided';

      Alert.alert(
        'Home Creation Failed',
        `Error: ${errorMessage}\n\nDetails: ${details}\n\nHint: ${hint}`
      );
    }
  };


  const handleManageHome = (home: Home) => {
    setSelectedHomeForManage(home);
    setManageHomeName(home.name);
    setIsManageModalVisible(true);
  };

  const handleRenameHome = async () => {
    if (!selectedHomeForManage || !manageHomeName.trim()) return;
    try {
      await deviceRepository.renameHome(selectedHomeForManage.id, manageHomeName);
      setIsManageModalVisible(false);
      await loadHomes();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteHome = async () => {
    if (!selectedHomeForManage) return;
    try {
      const homeIdToDelete = selectedHomeForManage.id;
      await deviceRepository.deleteHome(homeIdToDelete);

      if (activeHomeId === homeIdToDelete) {
        await SessionManager.setActiveHome(null);
        setActiveHomeId(null);
      }

      setIsManageModalVisible(false);
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
          <Typography variant="screenTitle">Hi {userName}</Typography>
          <Typography variant="secondary">Welcome Home</Typography>
        </View>
        <TouchableOpacity style={styles.notificationBtn}>
           <Text style={{ fontSize: 24 }}>🔔</Text>
        </TouchableOpacity>
      </View>

      <Typography variant="section" style={styles.sectionTitle}>My Homes</Typography>

      {homes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Typography variant="secondary" style={styles.emptyText}>No homes yet. Create your first home to get started.</Typography>
          <Button
            title="+ Create Home"
            onPress={() => setIsAddHomeModalVisible(true)}
            variant="primary"
            style={styles.emptyBtn}
          />
        </View>
      ) : (
        <View style={styles.homeList}>
          {homes.map((home, index) => (
            <HomeCard
              key={home.id}
              home={home}
              index={index}
              activeHomeId={activeHomeId}
              onNavigateToHome={onNavigateToHome}
              onManageHome={handleManageHome}
            />
          ))}
        </View>
      )}

      {homes.length > 0 && (
        <Button
          title="+ Add Home"
          onPress={() => setIsAddHomeModalVisible(true)}
          variant="secondary"
          style={styles.addHomeBtn}
        />
      )}

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

      <SiriusModal
        isVisible={isManageModalVisible}
        onClose={() => setIsManageModalVisible(false)}
        title={selectedHomeForManage ? `Manage ${selectedHomeForManage.name}` : 'Manage Home'}
      >
        <View style={styles.modalForm}>
          <Typography variant="secondary" style={styles.label}>Home Name</Typography>
          <TextInput
            style={styles.input}
            placeholder="Enter home name"
            value={manageHomeName}
            onChangeText={setManageHomeName}
            placeholderTextColor={SiriusTheme.colors.disabled}
          />
          <View style={styles.modalActions}>
            <Button
              title="Save Changes"
              onPress={handleRenameHome}
              style={{ flex: 1, marginRight: 8 }}
            />
            <Button
              title="Delete Home"
              onPress={handleDeleteHome}
              variant="secondary"
              style={{ flex: 1, borderColor: 'red' }}
            />
          </View>
          <Typography variant="secondary" style={styles.warningText}>
            Deleting a home will remove its rooms and devices from the app. Physical devices will NOT be reset.
          </Typography>
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
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: SiriusTheme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 14,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    marginVertical: 40,
  },
  emptyText: {
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyBtn: {
    width: '100%',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  warningText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    color: SiriusTheme.colors.textSecondary,
  },

});

export default DashboardScreen;
