import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Text,
} from 'react-native';
import { Typography, Box, Button, SiriusModal } from '../../components/common/UI';
import { DeviceCard } from '../../components/devices/DeviceCard';
import { SiriusTheme } from '../../constants/theme';
import deviceRepository from '../../api/repositories/CompositeDeviceRepository';
import SessionManager from '../../api/session/SessionManager';
import { SiriusDevice, Room } from '../../types/home';

interface RoomViewProps {
  homeId: string;
  roomId: string;
  onBack: () => void;
  onNavigateToDevice: (deviceId: string) => void;
  onNavigateToProvisioning: (roomId: string) => void;
}

const RoomView = ({ homeId, roomId, onBack, onNavigateToDevice, onNavigateToProvisioning }: RoomViewProps) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [devices, setDevices] = useState<SiriusDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isManageModalVisible, setIsManageModalVisible] = useState(false);
  const [manageRoomName, setManageRoomName] = useState('');

  // Log render values on every render
  console.log('[ROOM-RENDER]', {
    roomId,
    homeId,
    isLoading,
    isRefreshing,
    deviceCount: devices.length
  });

  useEffect(() => {
    console.log('[ROOM-LIFECYCLE] MOUNT', { homeId, roomId });
    loadRoomData();
    return () => {
      console.log('[ROOM-LIFECYCLE] UNMOUNT', { homeId, roomId });
    };
  }, [homeId, roomId]);

  const loadRoomData = async (silent = false) => {
    console.log(`[RoomView] loadRoomData START. silent: ${silent}, roomExists: ${!!room}, isLoading: ${isLoading}, isRefreshing: ${isRefreshing}`);

    if (!silent && !room) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    setError(null);

    try {
      const session = await SessionManager.getSession();
      const userId = session?.userId || 'user_legacy_v1';
      const homes = await deviceRepository.getHomes(userId);
      const home = homes.find(h => h.rooms.some(r => r.id === roomId));
      if (home) {
        const roomData = home.rooms.find(r => r.id === roomId);
        if (roomData) {
          setRoom(roomData);
          const devicesData = await deviceRepository.getDevicesInRoom(homeId, roomId);
          setDevices(devicesData);
        } else {
          throw new Error('Room data not found');
        }
      } else {
        throw new Error('Home not found');
      }
    } catch (e: any) {
      console.error(`[RoomView] loadRoomData ERROR:`, e);
      setError(e.message || 'Failed to load room data. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      console.log(`[RoomView] loadRoomData END.`);
    }
  };

  const handleToggle = async (deviceId: string, channelId: string, state: 'on' | 'off') => {
    console.log(`[RoomView] handleToggle START. deviceId: ${deviceId}, channelId: ${channelId}, nextState: ${state}`);

    // Optimistically update the UI state immediately
    setDevices(prevDevices => prevDevices.map(device => {
      if (device.factoryId === deviceId) {
        return {
          ...device,
          channels: device.channels.map(ch =>
            ch.id === channelId ? { ...ch, state } : ch
          ),
          // Update overall powerState based on updated channels
          powerState: device.channels.map(ch =>
            ch.id === channelId ? state : ch.state
          ).every(s => s === 'on') ? 'on' :
                     device.channels.map(ch =>
                        ch.id === channelId ? state : ch.state
                     ).every(s => s === 'off') ? 'off' : 'unknown'
        };
      }
      return device;
    }));

    try {
      await deviceRepository.setChannelState(deviceId, channelId, state);
      console.log(`[RoomView] setChannelState SUCCESS. Refreshing state in background...`);

      // Refresh the state in the background to ensure sync with server
      const updatedDevices = await deviceRepository.getDevicesInRoom(homeId, roomId);
      setDevices(updatedDevices);
      console.log(`[RoomView] Background refresh complete. handleToggle END.`);
    } catch (e) {
      console.error(`[RoomView] handleToggle ERROR:`, e);
      // Rollback optimistic update on error
      await loadRoomData(true);
    }
  };

  const handleOpenManageModal = () => {
    if (!room) return;
    setManageRoomName(room.name);
    setIsManageModalVisible(true);
  };

  const handleRenameRoom = async () => {
    if (!room || !manageRoomName.trim()) return;
    try {
      await deviceRepository.renameRoom(homeId, room.id, manageRoomName);
      setIsManageModalVisible(false);
      await loadRoomData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteRoom = async () => {
    if (!room) return;
    try {
      await deviceRepository.deleteRoom(homeId, room.id);
      setIsManageModalVisible(false);
      onBack();
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

  if (error) {
    return (
      <View style={styles.center}>
        <Typography variant="body" style={{ textAlign: 'center', marginBottom: 20 }}>
          {error}
        </Typography>
        <Button title="Retry" onPress={() => loadRoomData()} />
        <Button title="Go Back" onPress={onBack} variant="secondary" style={{ marginTop: 12 }} />
      </View>
    );
  }

  if (!room) {
    return (
      <View style={styles.center}>
        <Typography variant="body">Room not found</Typography>
        <Button title="Go Back" onPress={onBack} style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Typography variant="secondary">← Back</Typography>
        </TouchableOpacity>
        <Typography variant="screenTitle">{room.name}</Typography>
        <TouchableOpacity
          style={styles.manageBtn}
          onPress={handleOpenManageModal}
        >
          <Text style={{ fontSize: 20 }}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.deviceGrid}>
          {devices.map(device => (
            <DeviceCard
              key={device.factoryId}
              device={device}
              onPress={() => onNavigateToDevice(device.factoryId)}
              onToggle={(channelId, state) => handleToggle(device.factoryId, channelId, state)}
            />
          ))}
          {devices.length === 0 && (
            <View style={styles.emptyState}>
              <Typography variant="secondary">No devices in this room</Typography>
            </View>
          )}
        </View>

        <Button
          title="+ Add Device"
          onPress={() => onNavigateToProvisioning(roomId)}
          variant="secondary"
          style={styles.addDeviceBtn}
        />
      </ScrollView>
      <SiriusModal
        isVisible={isManageModalVisible}
        onClose={() => setIsManageModalVisible(false)}
        title={room ? `Manage ${room.name}` : 'Manage Room'}
      >
        <View style={styles.modalForm}>
          <Typography variant="secondary" style={styles.label}>Room Name</Typography>
          <TextInput
            style={styles.input}
            placeholder="Enter room name"
            value={manageRoomName}
            onChangeText={setManageRoomName}
            placeholderTextColor={SiriusTheme.colors.disabled}
          />
          <View style={styles.modalActions}>
            <Button
              title="Save Changes"
              onPress={handleRenameRoom}
              style={{ flex: 1, marginRight: 8 }}
            />
            <Button
              title="Delete Room"
              onPress={handleDeleteRoom}
              variant="secondary"
              style={{ flex: 1, borderColor: 'red' }}
            />
          </View>
          <Typography variant="secondary" style={styles.warningText}>
            {devices.length === 0
              ? 'Deleting a room will remove it from the app.'
              : `Deleting this room will remove ${devices.length} device(s) from the app hierarchy. Physical devices will NOT be reset.`}
          </Typography>
        </View>
      </SiriusModal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SiriusTheme.colors.background,
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
    padding: SiriusTheme.spacing.l,
    paddingTop: 40,
    marginBottom: 20,
  },
  backBtn: {
    padding: 8,
  },
  manageBtn: {
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
  scrollContent: {
    padding: SiriusTheme.spacing.l,
    paddingBottom: 40,
  },
  deviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  emptyState: {
    marginTop: 40,
    alignItems: 'center',
    width: '100%',
  },
  addDeviceBtn: {
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

export default RoomView;
