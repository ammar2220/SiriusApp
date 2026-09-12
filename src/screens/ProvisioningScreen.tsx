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
import { NativeModules } from 'react-native';
import { Typography, Box, Button, SiriusModal } from '../components/common/UI';
import { SiriusTheme } from '../constants/theme';
import apiClient from '../api/local/apiClient';
import deviceRepository from '../api/repositories/CompositeDeviceRepository';
import SessionManager from '../api/session/SessionManager';


const { WifiProvisioningModule, DeviceDiscoveryModule } = NativeModules;

type ProvisioningStep = 'INPUT' | 'CONNECTING_SOFTAP' | 'SENDING_CREDENTIALS' | 'WAITING_RECONNECT' | 'CONFIRM_IDENTITY' | 'NAME_DEVICE' | 'FINALIZING' | 'SUCCESS' | 'FAILED';

const ProvisioningScreen = ({ roomId, onComplete, onBack }: { roomId: string, onComplete?: () => void, onBack?: () => void }) => {
  const [ssid, setSsid] = useState('');
  const [pass, setPass] = useState('');
  const [step, setStep] = useState<ProvisioningStep>('INPUT');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [discoveredDevice, setDiscoveredDevice] = useState<{ ip: string, id: string } | null>(null);
  const [deviceName, setDeviceName] = useState('');

  const SOFTAP_SSID = 'AION_Prototype_ESP32';
  const SOFTAP_IP = '192.168.4.1';
  const SOFTAP_PASS = '';
  const TARGET_SERVICE_TYPE = '_http._tcp';
  const TARGET_FACTORY_ID = 'ESP32-80:f3:da:5e:1b:ec';

  const runProvisioningFlow = async () => {
    if (!ssid || !pass) {
      Alert.alert('Error', 'Please enter both Home Wi-Fi SSID and Password');
      return;
    }

    setErrorMessage(null);
    setDiscoveredDevice(null);

    try {
      // Step 1: Connect to SoftAP
      setStep('CONNECTING_SOFTAP');
      await WifiProvisioningModule.connectToSoftAP(SOFTAP_SSID, SOFTAP_PASS);

      // Step 2: Send credentials
      setStep('SENDING_CREDENTIALS');
      const provisionResult = await apiClient.provision(SOFTAP_IP, ssid, pass);

      const validStatuses = ['ok', 'success', 'connecting'];
      if (!validStatuses.includes(provisionResult.status)) {
         throw new Error(`Provisioning rejected: ${provisionResult.status}`);
      }

      // Step 3: Disconnect from SoftAP immediately
      await WifiProvisioningModule.disconnectFromSoftAP();

      // Step 4: Wait for reconnection and verify device via NSD
      setStep('WAITING_RECONNECT');

      // Give the Android device a few seconds to switch back to Home Wi-Fi
      await new Promise(resolve => setTimeout(() => resolve(true), 5000));

      let attempts = 0;
      const maxAttempts = 12; // 60 seconds total
      let deviceVerified = false;

      while (attempts < maxAttempts) {
        try {
          console.log(`Provisioning: Discovery attempt ${attempts + 1}/${maxAttempts}...`);
          const discoveryResult = await DeviceDiscoveryModule.discoverDevice(TARGET_SERVICE_TYPE);
          const deviceIp = discoveryResult.host;
          const devicePort = discoveryResult.port;

          const host = `${deviceIp}:${devicePort}`;
          console.log(`Provisioning: Found device at ${host}, verifying identity...`);
          const info = await apiClient.getInfo(host);

          if (info.id === TARGET_FACTORY_ID) {
            console.log(`Provisioning: Device identity verified: ${info.id}`);
            setDiscoveredDevice({ ip: host, id: info.id });
            deviceVerified = true;
            break;
          } else {
            console.log(`Provisioning: Device found but ID mismatch. Expected ${TARGET_FACTORY_ID}, got ${info.id}`);
          }
        } catch (e: any) {
          console.log(`Provisioning: Discovery/Verification failed: ${e.message}`);
        }

        attempts++;
        await new Promise(resolve => setTimeout(() => resolve(true), 5000));
      }

      if (!deviceVerified) {
        throw new Error('Device did not reconnect to Wi-Fi in time. Please check device power and Home Wi-Fi settings.');
      }

      setStep('CONFIRM_IDENTITY');

    } catch (e: any) {
      console.error(`Provisioning Error: ${e.message}`);
      setErrorMessage(e.message || 'An unexpected error occurred');
      setStep('FAILED');
    }
  };

  const handleConfirmIdentity = () => {
    setStep('NAME_DEVICE');
  };

  const handleSaveDevice = async () => {
    if (!deviceName.trim()) {
      Alert.alert('Error', 'Please enter a name for your device');
      return;
    }

    setStep('FINALIZING');
    try {
      const session = await SessionManager.getSession();
      const homeId = session?.activeHomeId || '';
      await deviceRepository.addDevice(homeId, roomId, deviceName, discoveredDevice?.ip);
      setStep('SUCCESS');
    } catch (e: any) {
      console.error(`Save Device Error: ${e.message}`);
      setErrorMessage(e.message || 'Failed to save device to home');
      setStep('FAILED');
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'INPUT':
        return (
          <View style={styles.section}>
            <Text style={styles.label}>Home Wi-Fi SSID</Text>
            <TextInput
              style={styles.input}
              value={ssid}
              onChangeText={setSsid}
              placeholder="Enter your Wi-Fi name"
              autoCapitalize="none"
            />
            <Text style={styles.label}>Home Wi-Fi Password</Text>
            <TextInput
              style={styles.input}
              value={pass}
              onChangeText={setPass}
              placeholder="Enter your Wi-Fi password"
              secureTextEntry
            />
            <TouchableOpacity style={styles.button} onPress={runProvisioningFlow}>
              <Text style={styles.buttonText}>Start Provisioning</Text>
            </TouchableOpacity>
          </View>
        );
      case 'CONNECTING_SOFTAP':
        return <StatusView label="Connecting to ESP32 SoftAP..." />;
      case 'SENDING_CREDENTIALS':
        return <StatusView label="Sending Wi-Fi credentials..." />;
      case 'WAITING_RECONNECT':
        return <StatusView label="Connecting device to your Wi-Fi..." />;
      case 'CONFIRM_IDENTITY':
        return (
          <View style={styles.section}>
            <Text style={styles.successText}>Device Found!</Text>
            <View style={styles.deviceInfo}>
              <Text style={styles.infoText}>ID: {discoveredDevice?.id}</Text>
              <Text style={styles.infoText}>IP: {discoveredDevice?.ip}</Text>
            </View>
            <TouchableOpacity style={styles.button} onPress={handleConfirmIdentity}>
              <Text style={styles.buttonText}>Confirm & Name Device</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { backgroundColor: '#666', marginTop: 10 }]} onPress={() => setStep('INPUT')}>
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        );
      case 'NAME_DEVICE':
        return (
          <View style={styles.section}>
            <Text style={styles.label}>Device Name</Text>
            <TextInput
              style={styles.input}
              value={deviceName}
              onChangeText={setDeviceName}
              placeholder="e.g. Living Room Light"
              autoCapitalize="words"
            />
            <TouchableOpacity style={styles.button} onPress={handleSaveDevice}>
              <Text style={styles.buttonText}>Finish Setup</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, { backgroundColor: '#666', marginTop: 10 }]} onPress={() => setStep('CONFIRM_IDENTITY')}>
              <Text style={styles.buttonText}>Back</Text>
            </TouchableOpacity>
          </View>
        );
      case 'FINALIZING':
        return <StatusView label="Adding device to your home..." />;
      case 'SUCCESS':
        return (
          <View style={styles.section}>
            <Text style={styles.successText}>✅ Device Added!</Text>
            <Text style={styles.infoText}>Your device is now ready for use.</Text>
            <TouchableOpacity style={styles.button} onPress={() => {
              if (onComplete) onComplete();
            }}>
              <Text style={styles.buttonText}>Go to Room</Text>
            </TouchableOpacity>
          </View>
        );
      case 'FAILED':
        return (
          <View style={styles.section}>
            <Text style={styles.errorText}>❌ Provisioning Failed</Text>
            <Text style={styles.infoText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.button} onPress={() => setStep('INPUT')}>
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        );
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => onBack && onBack()} style={styles.backBtn}>
          <Typography variant="secondary">← Back</Typography>
        </TouchableOpacity>
        <Typography variant="screenTitle" style={styles.title}>Device Provisioning</Typography>
        <View style={{ width: 60 }} />
      </View>
      {renderStep()}
    </ScrollView>
  );
};

const StatusView = ({ label }: { label: string }) => (
  <View style={styles.section}>
    <ActivityIndicator size="large" color="#007AFF" style={{ marginBottom: 20 }} />
    <Text style={styles.statusText}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 20,
  },
  backBtn: {
    padding: 8,
    width: 60,
  },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', color: '#333' },
  section: { backgroundColor: '#fff', padding: 20, borderRadius: 10, elevation: 3, alignItems: 'center' },
  label: { fontSize: 14, color: '#666', marginBottom: 5, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 5, fontSize: 16, marginBottom: 15, width: '100%' },
  button: { backgroundColor: '#007AFF', padding: 12, borderRadius: 5, alignItems: 'center', width: '100%', marginTop: 10 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  statusText: { fontSize: 16, textAlign: 'center', color: '#333' },
  successText: { fontSize: 20, fontWeight: 'bold', color: 'green', marginBottom: 10, textAlign: 'center' },
  errorText: { fontSize: 20, fontWeight: 'bold', color: 'red', marginBottom: 10, textAlign: 'center' },
  infoText: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 5 },
  deviceInfo: { marginBottom: 20, alignItems: 'center' },
});

export default ProvisioningScreen;
