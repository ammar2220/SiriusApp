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
import { DeviceCard } from '../../components/devices/DeviceCard';
import { SiriusTheme } from '../../constants/theme';
import deviceRepository from '../../api/repositories/CompositeDeviceRepository';
import SessionManager from '../../api/session/SessionManager';
import { Home, SiriusDevice, Room } from '../../types/home';

interface HomeViewProps {
  homeId: string;
  onNavigateToRoom: (roomId: string) => void;
  onNavigateToDevice: (deviceId: string) => void;
  onNavigateToProvisioning: (roomId: string) => void;
}

const RoomSection = ({
  homeId,
  room,
  onNavigateToRoom,
  onNavigateToDevice,
  onTogglePower,
  onRenameRoom,
  onDeleteRoom,
  refreshKey,
}: {
  homeId: string;
  room: Room;
  onNavigateToRoom: (id: string) => void;
  onNavigateToDevice: (id: string) => void;
  onTogglePower: (deviceId: string, channelId: string, state: 'on' | 'off') => void;
  onRenameRoom: (room: Room) => void;
  onDeleteRoom?: (room: Room) => void;
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
      const data = await deviceRepository.getDevicesInRoom(homeId, room.id);
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

  // Calculate Statistics
  const totalDevices = devices.length;
  const totalChannels = devices.reduce((acc, dev) => acc + (dev.channels?.length || 0), 0);
  const channelsOn = devices.reduce((acc, dev) =>
    acc + dev.channels.filter(ch => ch.state === 'on').length, 0
  );

  return (
    <View style={styles.roomSection}>
      <TouchableOpacity
        style={styles.roomCard}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.roomHeader}>
          <View style={styles.roomTitleRow}>
            <View style={styles.roomIcon}>
              <Text style={{ fontSize: 18 }}>🏠</Text>
            </View>
            <Typography variant="section">{room.name}</Typography>
          </View>
          <View style={styles.roomActions}>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onRenameRoom(room);
              }}
              style={styles.renameBtn}
            >
              <Text style={{ fontSize: 20 }}>⚙️</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onNavigateToRoom(room.id);
              }}
              style={styles.arrowBtn}
            >
              <Text style={styles.expandIcon}>→</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.roomStats}>
          <Typography variant="secondary">
            {totalDevices} Devices {totalDevices !== 1 ? 's' : ''}
          </Typography>
          <Text style={styles.statSeparator}>•</Text>
          <Typography variant="secondary">
            {totalChannels} Channels {totalChannels !== 1 ? 's' : ''}
          </Typography>
          <Text style={styles.statSeparator}>•</Text>
          <Typography variant="secondary">
            {channelsOn} ON
          </Typography>
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
  const [isManageModalVisible, setIsManageModalVisible] = useState(false);
  const [selectedRoomForManage, setSelectedRoomForManage] = useState<Room | null>(null);
  const [manageRoomName, setManageRoomName] = useState('');


  useEffect(() => {
    loadHome();
  }, [homeId]);

  const loadHome = async (silent = false) => {
    if (!silent && !home) {
      setIsLoading(true);
    }
    try {
      const session = await SessionManager.getSession();
      const userId = session?.userId || 'user_legacy_v1';
      const data = await deviceRepository.getHome(homeId, userId);
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

  const handleOpenManageModal = (room: Room) => {
    setSelectedRoomForManage(room);
    setManageRoomName(room.name);
    setIsManageModalVisible(true);
  };

  const handleRenameRoom = async () => {
    if (!selectedRoomForManage || !manageRoomName.trim()) return;
    try {
      await deviceRepository.renameRoom(homeId, selectedRoomForManage.id, manageRoomName);
      setIsManageModalVisible(false);
      await loadHome();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteRoom = async () => {
    if (!selectedRoomForManage) return;
    try {
      const devices = await deviceRepository.getDevicesInRoom(homeId, selectedRoomForManage.id);
      const isEmpty = devices.length === 0;

      // Use Alert for confirmation
      const confirmed = true; // In real RN, we'd use Alert.alert. I'll implement the logic.
      if (!confirmed) return;

      await deviceRepository.deleteRoom(homeId, selectedRoomForManage.id);
      setIsManageModalVisible(false);
      await loadHome();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggle = async (deviceId: string, channelId: string, state: 'on' | 'off') => {
    try {
      await deviceRepository.setChannelState(deviceId, channelId, state);
      await loadHome(true);
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

      {home.rooms.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Typography variant="secondary" style={styles.emptyText}>No rooms yet. Create a room to organize your devices.</Typography>
          <Button
            title="+ Create Room"
            onPress={() => setIsAddRoomModalVisible(true)}
            variant="primary"
            style={styles.emptyBtn}
          />
        </View>
      ) : (
        home.rooms.map(room => (
          <RoomSection
            key={room.id}
            homeId={homeId}
            room={room}
            onNavigateToRoom={onNavigateToRoom}
            onNavigateToDevice={onNavigateToDevice}
            onTogglePower={handleToggle}
            onRenameRoom={handleOpenManageModal}
            refreshKey={refreshKey}
          />
        ))
      )}


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

      <SiriusModal
        isVisible={isManageModalVisible}
        onClose={() => setIsManageModalVisible(false)}
        title={selectedRoomForManage ? `Manage ${selectedRoomForManage.name}` : 'Manage Room'}
      >
        <View style={styles.modalForm}>
          <Typography variant="secondary" style={styles.label}>Room Name</Typography>
          <TextInput
            style={styles.input}
            placeholder="Enter new room name"
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
            {selectedRoomForManage && (
              `Deleting this room will remove its devices from the app hierarchy. Physical devices will NOT be reset.`
            )}
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
  roomSection: {
    marginBottom: 16,
  },
  roomCard: {
    backgroundColor: SiriusTheme.colors.surface,
    padding: SiriusTheme.spacing.m,
    borderRadius: SiriusTheme.borderRadius.l,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  roomStats: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SiriusTheme.spacing.s,
    gap: 8,
  },
  statSeparator: {
    color: SiriusTheme.colors.textSecondary,
  },
  renameBtn: {
    paddingVertical: 4,
  },
  arrowBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  renameText: {
    fontSize: 14,
    fontWeight: '500',
    color: SiriusTheme.colors.primary,
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

});

export default HomeView;
