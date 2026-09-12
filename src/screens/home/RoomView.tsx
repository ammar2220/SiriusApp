import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Typography, Box, Button, SiriusModal } from '../../components/common/UI';
import { DeviceCard } from '../../components/devices/DeviceCard';
import { SiriusTheme } from '../../constants/theme';
import deviceRepository from '../../api/repositories/CompositeDeviceRepository';
import { SiriusDevice, Room } from '../../types/home';

interface RoomViewProps {
  roomId: string;
  onBack: () => void;
  onNavigateToDevice: (deviceId: string) => void;
  onNavigateToProvisioning: (roomId: string) => void;
}

const RoomView = ({ roomId, onBack, onNavigateToDevice, onNavigateToProvisioning }: RoomViewProps) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [devices, setDevices] = useState<SiriusDevice[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRoomData();
  }, [roomId]);

  const loadRoomData = async () => {
    setIsLoading(true);
    try {
      const homes = await deviceRepository.getHomes();
      const home = homes.find(h => h.rooms.some(r => r.id === roomId));
      if (home) {
        const roomData = home.rooms.find(r => r.id === roomId);
        if (roomData) {
          setRoom(roomData);
          const devicesData = await deviceRepository.getDevicesInRoom(roomId);
          setDevices(devicesData);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (deviceId: string, channelId: string, state: 'on' | 'off') => {
    try {
      await deviceRepository.setPower(deviceId, channelId, state);
      const updatedDevices = await deviceRepository.getDevicesInRoom(roomId);
      setDevices(updatedDevices);
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
        <View style={{ width: 50 }} />
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
});

export default RoomView;
