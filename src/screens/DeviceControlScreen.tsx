import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Text,
  TextInput,
  Alert,
  Modal,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Typography, Box, Button, SiriusModal } from '../components/common/UI';
import { SiriusTheme } from '../constants/theme';
import deviceRepository from '../api/repositories/CompositeDeviceRepository';
import SessionManager from '../api/session/SessionManager';
import { SiriusDevice, Room } from '../types/home';
import { CircularPowerDial } from '../components/devices/CircularPowerDial';

const formatLastSeen = (timestamp: number | null) => {
  if (!timestamp) return 'Never';
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (diff < 60000) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

interface DeviceControlProps {
  deviceId: string;
  onBack: () => void;
}

const DeviceControlScreen = ({ deviceId, onBack }: DeviceControlProps) => {
  const [device, setDevice] = useState<SiriusDevice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [roomName, setRoomName] = useState<string>('');
  const [isInfoExpanded, setIsInfoExpanded] = useState(false);
  const pollingTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef<string>(AppState.currentState ?? 'active');
  const pollRef = useRef<{ active: boolean, commandId: string | null }>({ active: false, commandId: null });
  const mountRef = useRef(true);
  const genRef = useRef(0);

  // Lifecycle Modals State

  // Lifecycle Modals State

  // Lifecycle Modals State
  const [isMoreMenuVisible, setIsMoreMenuVisible] = useState(false);
  const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
  const [isMoveModalVisible, setIsMoveModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);

  useEffect(() => {
    mountRef.current = true;
    genRef.current += 1;
    loadDevice();

    // Subscribe to real-time updates for this device
    const currentGen = genRef.current;
    const unsubscribe = deviceRepository.onDeviceUpdate((updatedDevice) => {
      if (mountRef.current && genRef.current === currentGen && updatedDevice.factoryId === deviceId) {
        setDevice(updatedDevice);
      }
    });

    return () => {
      mountRef.current = false;
      unsubscribe();
      pollRef.current.active = false;
    };
  }, [deviceId]);

  // Removed polling logic (startPolling, stopPolling) and AppState listener for polling
  const loadDevice = async (silent = false) => {
    if (!silent) {
      setIsLoading(true);
    }
    const requestGen = genRef.current;
    try {
      const data = await deviceRepository.getDevice(deviceId);
      if (!mountRef.current || genRef.current !== requestGen) return;
      setDevice(data);

      // Resolve room name
      if (data.roomId) {
        const session = await SessionManager.getSession();
        if (!mountRef.current || genRef.current !== requestGen) return;
        const userId = session?.activeUserId;
        if (!userId) {
          console.error('[DeviceControlScreen] No active session found to resolve room');
        } else {
          const home = await deviceRepository.getHome(data.homeId, userId);
          if (!mountRef.current || genRef.current !== requestGen) return;
          const room = home?.rooms.find(r => r.id === data.roomId);
          setRoomName(room ? room.name : data.roomId);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (mountRef.current && genRef.current === requestGen) {
        setIsLoading(false);
      }
    }
  };

  const handleToggle = async (channelId: string) => {
    if (!device) return;
    const channel = device.channels.find(c => c.id === channelId);
    if (!channel) return;

    const requestGen = genRef.current;
    const nextState = channel.state === 'on' ? 'off' : 'on';
    setIsToggling(true);
    try {
      const result = await deviceRepository.setChannelState(deviceId, channelId, nextState);
      if (!mountRef.current || genRef.current !== requestGen) return;

      switch (result.status) {
        case 'accepted':
          // Stop fabricating resultingState; just refresh authoritative state
          await loadDevice(true);
          break;
        case 'applied_unconfirmed':
          // 1. Set polling identity BEFORE await to prevent races during initial load
          pollRef.current = { active: true, commandId: result.commandId };
          await loadDevice(true);

          // 2. Re-verify identity after await before starting the loop
          if (!pollRef.current.active || pollRef.current.commandId !== result.commandId) return;

          const pollForCommandStatus = async (attempts = 0) => {
            // 3. Check if poll is still active and for this specific command
            if (!pollRef.current.active || pollRef.current.commandId !== result.commandId || attempts >= 10) {
              if (pollRef.current.commandId === result.commandId) {
                pollRef.current.active = false;
              }
              return;
            }

            await new Promise<void>(res => setTimeout(res, 5000));

            // 4. Re-verify identity and activity after delay
            if (!pollRef.current.active || pollRef.current.commandId !== result.commandId) return;

            try {
              const statusResult = await deviceRepository.pollCommandStatus(result.commandId);

              // 5. Final check before acting on result
              if (!pollRef.current.active || pollRef.current.commandId !== result.commandId) return;

              if (statusResult.status === 'accepted') {
                await loadDevice(true);
                // 6. Re-verify identity after loadDevice before stopping current poll
                if (pollRef.current.commandId === result.commandId) {
                  pollRef.current.active = false;
                }
              } else if (statusResult.status === 'rejected') {
                if (mountRef.current) {
                  Alert.alert('Control Error', statusResult.reason || 'The device rejected the command.');
                }
                if (pollRef.current.commandId === result.commandId) {
                  pollRef.current.active = false;
                }
              } else {
                // Still applied_unconfirmed or unknown, continue polling
                await pollForCommandStatus(attempts + 1);
              }
            } catch (e) {
              console.error('[DeviceControl] Durable status poll failed:', e);
              if (pollRef.current.active && pollRef.current.commandId === result.commandId) {
                await pollForCommandStatus(attempts + 1);
              }
            }
          };

          pollForCommandStatus();
          break;
        case 'rejected':
          if (mountRef.current && genRef.current === requestGen) {
            Alert.alert('Control Error', result.reason || 'The device rejected the command.');
          }
          break;
      }
    } catch (e: any) {
      console.error(e);
      if (mountRef.current && genRef.current === requestGen) {
        Alert.alert('Network Error', e.message || 'Failed to communicate with the device.');
      }
    } finally {
      if (mountRef.current && genRef.current === requestGen) {
        setIsToggling(false);
      }
    }
  };

  const handleRename = async () => {
    if (!newName.trim()) return;
    try {
      const requestGen = genRef.current;
      await deviceRepository.renameDevice(deviceId, newName);
      if (!mountRef.current || genRef.current !== requestGen) return;
      setIsRenameModalVisible(false);
      // Force refresh from repository to update header title and device state
      await loadDevice(true);
    } catch (e: any) {
      if (mountRef.current) {
        Alert.alert('Error', e.message);
      }
    }
  };

  const handleMove = async (newRoomId: string) => {
    try {
      const requestGen = genRef.current;
      if (!device) {
        Alert.alert('Error', 'Device data is missing');
        return;
      }

      const homeId = device.homeId;
      if (!homeId) {
        Alert.alert('Error', 'Could not determine the device\'s home.');
        return;
      }

      await deviceRepository.moveDevice(deviceId, newRoomId, homeId);
      if (!mountRef.current || genRef.current !== requestGen) return;
      setIsMoveModalVisible(false);
      await loadDevice(true);
    } catch (e: any) {
      if (mountRef.current) {
        Alert.alert('Error', e.message);
      }
    }
  };

  const handleRemove = async () => {
    try {
      await deviceRepository.removeDevice(deviceId);
      Alert.alert('Success', 'Device removed from Sirius');
      onBack();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const openMoveModal = async () => {
    try {
      const homes = await deviceRepository.getHomes();
      const currentHome = homes.find(h =>
        h.rooms.some(r => r.id === device?.roomId)
      );

      if (!currentHome) {
        Alert.alert('Error', 'Could not determine the device\'s home.');
        return;
      }

      setAvailableRooms(currentHome.rooms);
      setIsMoveModalVisible(true);
    } catch (e) {
      Alert.alert('Error', 'Failed to load rooms');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={SiriusTheme.colors.primary} />
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <Typography variant="body">Device not found</Typography>
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
        <View style={styles.titleContainer}>
          <Typography
            variant="screenTitle"
            style={styles.title}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {device.displayName}
          </Typography>
          <Typography variant="secondary" style={styles.roomSubtitle}>
            {device.product.name} • {roomName}
          </Typography>
        </View>
        <TouchableOpacity
          style={styles.moreBtn}
          onPress={() => setIsMoreMenuVisible(true)}
        >
          <Text style={{ fontSize: 20 }}>⋮</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.controlArea}>
          <View style={styles.channelList}>
            {device.channels.map((channel) => (
              <View key={channel.id} style={styles.channelControl}>
                <View style={styles.channelInfo}>
                  <Typography variant="body" style={styles.channelName}>
                    {channel.name}
                  </Typography>
                  <Typography variant="secondary" style={styles.channelIndex}>
                    CH {channel.index}
                  </Typography>
                </View>
                <CircularPowerDial
                  state={channel.state as 'on' | 'off'}
                  onToggle={() => handleToggle(channel.id)}
                />
              </View>
            ))}
          </View>

          <View style={styles.statusBadge}>
            <View style={[styles.dot, { backgroundColor: device.connectionStatus === 'online' ? '#34C759' : '#FF3B30' }]} />
            <Typography variant="status" style={{ color: device.connectionStatus === 'online' ? '#34C759' : '#FF3B30' }}>
              {device.connectionStatus === 'online' ? 'Connected' : 'Offline'}
            </Typography>
          </View>
        </View>

        <Box elevation="medium" style={styles.infoCard}>
          <TouchableOpacity
            style={styles.infoHeader}
            onPress={() => setIsInfoExpanded(!isInfoExpanded)}
            activeOpacity={0.7}
          >
            <Typography variant="card">Information</Typography>
            <Typography variant="secondary" style={{ fontSize: 16 }}>
              {isInfoExpanded ? '▴' : '▾'}
            </Typography>
          </TouchableOpacity>

          {isInfoExpanded && (
            <View style={{ marginTop: 16 }}>
              <View style={styles.infoRow}>
                <Typography variant="secondary">Firmware</Typography>
                <Typography variant="body">{device.firmwareVersion}</Typography>
              </View>
              <View style={styles.infoRow}>
                <Typography variant="secondary">Product</Typography>
                <Typography variant="body">{device.product.name}</Typography>
              </View>
              <View style={styles.infoRow}>
                <Typography variant="secondary">Factory ID</Typography>
                <Typography variant="body" style={{ fontFamily: 'monospace' }}>{device.factoryId}</Typography>
              </View>
              <View style={styles.infoRow}>
                <Typography variant="secondary">Signal Strength</Typography>
                <Typography variant="body">{device.rssi} dBm</Typography>
              </View>
              <View style={styles.infoRow}>
                <Typography variant="secondary">Last Seen</Typography>
                <Typography variant="body">{formatLastSeen(device.lastSeen)}</Typography>
              </View>
            </View>
          )}
        </Box>
      </ScrollView>

      {/* More Menu Modal */}
      <SiriusModal
        isVisible={isMoreMenuVisible}
        onClose={() => setIsMoreMenuVisible(false)}
        title="Device Options"
      >
        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setIsMoreMenuVisible(false); setNewName(device.displayName); setIsRenameModalVisible(true); }}>
            <Text style={styles.menuItemText}>Rename Device</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setIsMoreMenuVisible(false); openMoveModal(); }}>
            <Text style={styles.menuItemText}>Move to Room</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.menuItem, styles.menuItemDanger]}
            onPress={() => {
              setIsMoreMenuVisible(false);
              Alert.alert(
                'Remove Device',
                'This will remove the device from Sirius and reset the physical device’s Wi-Fi settings. You’ll need to provision it again to use it.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: handleRemove }
                ]
              );
            }}
          >
            <Text style={[styles.menuItemText, { color: '#FF3B30' }]}>Remove Device</Text>
          </TouchableOpacity>
        </View>
      </SiriusModal>

      {/* Rename Modal */}
      <SiriusModal
        isVisible={isRenameModalVisible}
        onClose={() => setIsRenameModalVisible(false)}
        title="Rename Device"
      >
        <View style={styles.modalForm}>
          <TextInput
            style={styles.input}
            value={newName}
            onChangeText={setNewName}
            placeholder="Enter device name"
            autoFocus
          />
          <View style={styles.modalButtons}>
            <Button title="Cancel" variant="secondary" onPress={() => setIsRenameModalVisible(false)} />
            <Button title="Save" onPress={handleRename} />
          </View>
        </View>
      </SiriusModal>

      {/* Move Modal */}
      <SiriusModal
        isVisible={isMoveModalVisible}
        onClose={() => setIsMoveModalVisible(false)}
        title="Move to Room"
      >
        <ScrollView style={styles.modalList}>
          <Typography variant="secondary" style={{ marginBottom: 12, fontWeight: 'bold' }}>
            Select New Room
          </Typography>
          {availableRooms.map(room => (
            <TouchableOpacity
              key={room.id}
              style={[styles.roomOption, room.id === device?.roomId && styles.roomOptionActive]}
              onPress={() => handleMove(room.id)}
              disabled={room.id === device?.roomId}
            >
              <Text style={[styles.roomOptionText, room.id === device?.roomId && styles.roomOptionTextActive]}>
                {room.name} {room.id === device?.roomId ? '(Current)' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
    width: 60,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  title: {
    textAlign: 'center',
  },
  roomSubtitle: {
    textAlign: 'center',
  },
  moreBtn: {
    padding: 8,
    width: 60,
    alignItems: 'flex-end',
  },
  scrollContent: {
    padding: SiriusTheme.spacing.l,
    paddingBottom: 40,
  },
  controlArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 40,
  },
  channelList: {
    gap: 24,
    marginBottom: 40,
    width: '100%',
  },
  channelControl: {
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
  channelInfo: {
    flexDirection: 'column',
    gap: 4,
  },
  channelName: {
    fontSize: 18,
    fontWeight: '600',
  },
  channelIndex: {
    fontSize: 12,
    textTransform: 'uppercase',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SiriusTheme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 32,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  infoCard: {
    marginTop: 40,
    padding: SiriusTheme.spacing.l,
    borderRadius: SiriusTheme.borderRadius.xl,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  menuContainer: {
    gap: 12,
    marginTop: 10,
  },
  menuItem: {
    backgroundColor: SiriusTheme.colors.surface,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SiriusTheme.colors.disabled,
  },
  menuItemDanger: {
    borderColor: '#FF3B30',
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: SiriusTheme.colors.textPrimary,
  },
  modalForm: {
    gap: 20,
    paddingVertical: 10,
  },
  input: {
    backgroundColor: SiriusTheme.colors.surface,
    borderRadius: SiriusTheme.borderRadius.m,
    padding: SiriusTheme.spacing.m,
    borderWidth: 1,
    borderColor: SiriusTheme.colors.disabled,
    color: SiriusTheme.colors.textPrimary,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalList: {
    maxHeight: 300,
  },
  roomOption: {
    backgroundColor: SiriusTheme.colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: SiriusTheme.colors.disabled,
  },
  roomOptionActive: {
    borderColor: SiriusTheme.colors.primary,
    backgroundColor: SiriusTheme.colors.primaryLight,
  },
  roomOptionText: {
    fontSize: 16,
    color: SiriusTheme.colors.textPrimary,
    textAlign: 'center',
  },
  roomOptionTextActive: {
    fontWeight: 'bold',
    color: SiriusTheme.colors.primary,
  },
});

export default DeviceControlScreen;
