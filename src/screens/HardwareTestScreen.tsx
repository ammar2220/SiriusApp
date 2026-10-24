import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import apiClient from '../api/local/apiClient';
import { DeviceModel } from '../types/device';

const HardwareTestScreen = () => {
  const [ip, setIp] = useState('');
  const [loading, setLoading] = useState(false);
  const [device, setDevice] = useState<DeviceModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setLoading(true);
    setError(null);
    try {
      const info = await apiClient.getInfo(ip);
      const state = await apiClient.getState(ip);

      setDevice({
        factoryId: info.id,
        displayName: 'Test Device',
        ipAddress: ip,
        powerState: state.channels.some(ch => ch.state === 'on') ? 'on' :
                    state.channels.every(ch => ch.state === 'off') ? 'off' : 'unknown',
        rssi: state.rssi,
        connectionStatus: 'online',
        firmwareVersion: info.ver,
      });
    } catch (e: any) {
      setError(e.message || 'Failed to connect to device');
      setDevice(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePower = async (state: 'on' | 'off') => {
    if (!device) return;
    setLoading(true);
    try {
      await apiClient.setChannelState(device.ipAddress, 1, state);
      // Refresh state after control
      const newState = await apiClient.getState(device.ipAddress);
      setDevice({ ...device, powerState: newState.channels.some(ch => ch.state === 'on') ? 'on' :
                  newState.channels.every(ch => ch.state === 'off') ? 'off' : 'unknown', rssi: newState.rssi });
    } catch (e: any) {
      Alert.alert('Error', `Failed to set power ${state}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!device) return;
    setLoading(true);
    try {
      const state = await apiClient.getState(device.ipAddress);
      setDevice({ ...device, powerState: state.channels.some(ch => ch.state === 'on') ? 'on' :
                  state.channels.every(ch => ch.state === 'off') ? 'off' : 'unknown', rssi: state.rssi });
    } catch (e: any) {
      setError('Failed to refresh state');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Sirius Hardware Test</Text>

      <View style={styles.section}>
        <Text style={styles.label}>ESP32 Host IP</Text>
        <TextInput
          style={styles.input}
          value={ip}
          onChangeText={setIp}
          placeholder="e.g. 192.168.1.100"
          keyboardType="numeric"
        />
        <TouchableOpacity
          style={styles.button}
          onPress={handleConnect}
          disabled={loading}
        >
          <Text style={styles.buttonText}>{loading ? 'Connecting...' : 'Connect'}</Text>
        </TouchableOpacity>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {device && (
        <View style={styles.deviceSection}>
          <Text style={styles.statusText}>Status: {device.connectionStatus.toUpperCase()}</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Device ID:</Text>
            <Text style={styles.infoValue}>{device.factoryId}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Firmware:</Text>
            <Text style={styles.infoValue}>{device.firmwareVersion}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>RSSI:</Text>
            <Text style={styles.infoValue}>{device.rssi} dBm</Text>
          </View>

          <View style={styles.stateContainer}>
            <Text style={styles.stateLabel}>Current State:</Text>
            <Text style={[styles.stateValue, device.powerState === 'on' ? styles.on : styles.off]}>
              {device.powerState.toUpperCase()}
            </Text>
          </View>

          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.ctrlButton, styles.btnOn]}
              onPress={() => handlePower('on')}
              disabled={loading}
            >
              <Text style={styles.ctrlText}>ON</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.ctrlButton, styles.btnOff]}
              onPress={() => handlePower('off')}
              disabled={loading}
            >
              <Text style={styles.ctrlText}>OFF</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefresh}
            disabled={loading}
          >
            <Text style={styles.refreshText}>Refresh State</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
    color: '#333',
  },
  section: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 5,
    fontSize: 16,
    marginBottom: 15,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 10,
  },
  deviceSection: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    elevation: 3,
  },
  statusText: {
    textAlign: 'center',
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#007AFF',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    color: '#666',
    fontSize: 14,
  },
  infoValue: {
    fontWeight: '500',
    fontSize: 14,
  },
  stateContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  stateLabel: {
    fontSize: 16,
    color: '#333',
    marginBottom: 5,
  },
  stateValue: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  on: { color: 'green' },
  off: { color: 'red' },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  ctrlButton: {
    width: '40%',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnOn: { backgroundColor: '#4CAF50' },
  btnOff: { backgroundColor: '#F44336' },
  ctrlText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
  refreshButton: {
    alignItems: 'center',
    padding: 10,
  },
  refreshText: {
    color: '#007AFF',
    fontSize: 14,
  },
});

export default HardwareTestScreen;
