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
import { DeviceCard } from '../../components/devices/DeviceCard';
import { SiriusTheme } from '../../constants/theme';
import deviceRepository from '../../api/repositories/CompositeDeviceRepository';
import { Home, SiriusDevice, Room } from '../../types/home';

interface HomeViewProps {
  homeId: string;
  onNavigateToRoom: (roomId: string) => void;
  onNavigateToDevice: (deviceId: string) => void;
  onNavigateToProvisioning: (roomId: string) => void;
}

const RoomSection = ({
  room,
  onNavigateToRoom,
  onNavigateToDevice,
  onTogglePower,
  refreshKey,
}: {
  room: Room;
  onNavigateToRoom: (id: string) => void;
  onNavigateToDevice: (id: string) => void;
  onTogglePower: (deviceId: string, channelId: string, state: 'on' | 'off') => void;
  refreshKey: number;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [devices, setDevices] = useState<SiriusDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadDevices = async () => {
    if (!isExpanded) return;

    if (devices.length === 0) {
      setIsLoading(true);
    }
    try {
      const data = await deviceRepository.getDevicesInRoom(room.id);
      setDevices(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, [isExpanded, refreshKey]);

  return (
    <View style={styles.roomSection}>
      <TouchableOpacity
        style={styles.roomHeader}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.roomTitleRow}>
          <View style={styles.roomIcon}>
            <Text style={{ fontSize: 18 }}>🏠</Text>
          </View>
          <Typography variant="section">{room.name}</Typography>
        </View>
        <View style={styles.roomActions}>
          <TouchableOpacity onPress={() => onNavigateToRoom(room.id)} style={styles.seeAllBtn}>
            <Typography variant="secondary" style={styles.seeAll}>See all</Typography>
          </TouchableOpacity>
          <Text style={styles.expandIcon}>{isExpanded ? '▴' : '▾'}</Text>
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.deviceGrid}>
          {isLoading ? (
            <ActivityIndicator color={SiriusTheme.colors.primary} style={{ alignSelf: 'center', marginVertical: 20 }} />
          ) : (
            devices.map(device => (
              <DeviceCard
                key={device.factoryId}
                device={device}
                onPress={() => onNavigateToDevice(device.factoryId)}
                onToggle={(channelId, state) => onTogglePower(device.factoryId, channelId, state)}
              />
            ))
          )}
          {!isLoading && devices.length === 0 && (
            <Typography variant="secondary" style={styles.noDevices}>No devices in this room</Typography>
          )}
        </View>
      )}
    </View>
  );
};

const HomeView = ({ homeId, onNavigateToRoom, onNavigateToDevice }: HomeViewProps) => {
  const [home, setHome] = useState<Home | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddRoomModalVisible, setIsAddRoomModalVisible] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState('Living');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadHome();
  }, [homeId]);

  useEffect(() => {
    loadHome();
  }, [homeId]);

  const loadHome = async () => {
    setIsLoading(true);
    try {
      const data = await deviceRepository.getHome(homeId);
      setHome(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRoom = async () => {
    if (!newRoomName.trim()) return;
    try {
      await deviceRepository.addRoom(homeId, newRoomName, newRoomType);
      setNewRoomName('');
      setIsAddRoomModalVisible(false);
      await loadHome();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggle = async (deviceId: string, channelId: string, state: 'on' | 'off') => {
    try {
      await deviceRepository.setPower(deviceId, channelId, state);
      await loadHome();
      setRefreshKey(prev => prev + 1);
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

  if (!home) {
    return (
      <View style={styles.center}>
        <Typography variant="body">Home not found</Typography>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <View>
          <Typography variant="screenTitle">Hi Ammar</Typography>
          <Typography variant="secondary">Welcome to {home.name}</Typography>
        </View>
        <TouchableOpacity style={styles.notificationBtn}>
           <Text style={{ fontSize: 24 }}>🔔</Text>
        </TouchableOpacity>
      </View>

      <Typography variant="section" style={styles.sectionTitle}>My Rooms</Typography>

      {home.rooms.map(room => (
        <RoomSection
          key={room.id}
          room={room}
          onNavigateToRoom={onNavigateToRoom}
          onNavigateToDevice={onNavigateToDevice}
          onTogglePower={handleToggle}
          refreshKey={refreshKey}
        />
      ))}

      <Button
        title="+ Add Room"
        onPress={() => setIsAddRoomModalVisible(true)}
        variant="secondary"
        style={styles.addRoomBtn}
      />

      <SiriusModal
        isVisible={isAddRoomModalVisible}
        onClose={() => setIsAddRoomModalVisible(false)}
        title="Add New Room"
      >
        <View style={styles.modalForm}>
          <Typography variant="secondary" style={styles.label}>Room Name</Typography>
          <TextInput
            style={styles.input}
            placeholder="e.g. Kitchen"
            value={newRoomName}
            onChangeText={setNewRoomName}
            placeholderTextColor={SiriusTheme.colors.disabled}
          />
          <Typography variant="secondary" style={styles.label}>Room Type</Typography>
          <TextInput
            style={styles.input}
            placeholder="e.g. Cooking"
            value={newRoomType}
            onChangeText={setNewRoomType}
            placeholderTextColor={SiriusTheme.colors.disabled}
          />
          <Button
            title="Save Room"
            onPress={handleAddRoom}
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
  roomSection: {
    marginBottom: 16,
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: SiriusTheme.colors.surface,
    padding: SiriusTheme.spacing.m,
    borderRadius: SiriusTheme.borderRadius.l,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  roomTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: SiriusTheme.colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  roomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  seeAllBtn: {
    paddingVertical: 4,
  },
  seeAll: {
    fontSize: 14,
    fontWeight: '500',
  },
  expandIcon: {
    fontSize: 16,
    color: SiriusTheme.colors.textSecondary,
  },
  deviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 4,
  },
  noDevices: {
    fontStyle: 'italic',
    marginTop: 16,
    width: '100%',
    textAlign: 'center',
  },
  addRoomBtn: {
    width: '100%',
    height: 56,
    borderRadius: SiriusTheme.borderRadius.m,
    borderWidth: 1,
    borderColor: SiriusTheme.colors.primary,
    marginTop: 24,
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

export default HomeView;
