import React from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Typography } from '../common/UI';
import { SiriusTheme } from '../../constants/theme';
import { SiriusDevice } from '../../types/home';

interface DeviceCardProps {
  device: SiriusDevice;
  onToggle: (channelId: string, state: 'on' | 'off') => void;
  onPress: () => void;
}

export const DeviceCard = ({ device, onToggle, onPress }: DeviceCardProps) => {
  return (
    <TouchableOpacity
      style={[styles.card, device.connectionStatus === 'offline' && styles.offline]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          {/* Generic Device Icon */}
          <View style={[styles.icon, { backgroundColor: device.powerState === 'on' ? SiriusTheme.colors.primaryLight : SiriusTheme.colors.disabled }]} />
        </View>
        <View style={styles.titleContainer}>
          <Typography variant="card">{device.displayName}</Typography>
          <Typography variant="secondary">{device.connectionStatus}</Typography>
        </View>
      </View>

      <View style={styles.channels}>
        {device.channels.map(channel => (
          <TouchableOpacity
            key={channel.id}
            style={styles.channelRow}
            onPress={() => onToggle(channel.id, channel.state === 'on' ? 'off' : 'on')}
          >
            <Typography variant="body">{channel.name}</Typography>
            <View style={[
              styles.toggle,
              { backgroundColor: channel.state === 'on' ? SiriusTheme.colors.primary : SiriusTheme.colors.disabled }
            ]}>
              <View style={[
                styles.toggleThumb,
                { marginLeft: channel.state === 'on' ? 16 : 2 }
              ]} />
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: SiriusTheme.colors.surface,
    borderRadius: SiriusTheme.borderRadius.l,
    padding: SiriusTheme.spacing.m,
    width: '47%',
    margin: '1.5%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  offline: {
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    marginRight: 10,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  titleContainer: {
    flex: 1,
  },
  channels: {
    gap: 8,
  },
  channelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toggle: {
    width: 36,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#fff',
  },
});
