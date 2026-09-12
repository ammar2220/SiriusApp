import React, { useState, useEffect } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View, TouchableOpacity, Text, ActivityIndicator } from 'react-native';
import HardwareTestScreen from './src/screens/HardwareTestScreen';
import ProvisioningScreen from './src/screens/ProvisioningScreen';
import DashboardScreen from './src/screens/home/DashboardScreen';
import HomeView from './src/screens/home/HomeView';
import RoomView from './src/screens/home/RoomView';
import DeviceControlScreen from './src/screens/DeviceControlScreen';
import SignInScreen from './src/screens/auth/SignInScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import AutomationsScreen from './src/screens/AutomationsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import deviceRepository from './src/api/repositories/CompositeDeviceRepository';
import SessionManager from './src/api/session/SessionManager';

const App = () => {
  const [isHydrating, setIsHydrating] = useState(true);
  const [screen, setScreen] = useState<'auth-signin' | 'auth-signup' | 'dashboard' | 'home' | 'room' | 'device' | 'provisioning' | 'automations' | 'profile'>('auth-signin');
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  useEffect(() => {
    const hydrate = async () => {
      try {
        await deviceRepository.init();
        const session = await SessionManager.getSession();
        setSelectedHomeId(session?.activeHomeId || null);
      } catch (e) {
        console.error('App hydration failed', e);
      } finally {
        setIsHydrating(false);
      }
    };
    hydrate();
  }, []);

  const navigateToHome = async (homeId: string) => {
    await SessionManager.setActiveHome(homeId);
    setSelectedHomeId(homeId);
    setScreen('home');
  };

  const navigateToRoom = (roomId: string) => {
    setSelectedRoomId(roomId);
    setScreen('room');
  };

  const navigateToDevice = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    setScreen('device');
  };

  const navigateToProvisioning = (roomId: string) => {
    setSelectedRoomId(roomId);
    setScreen('provisioning');
  };

  const handleAuthSuccess = () => {
    setScreen('dashboard');
  };

  if (isHydrating) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading Sirius...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {screen === 'auth-signin' ? (
        <SignInScreen
          onSignIn={handleAuthSuccess}
          onNavigateToSignUp={() => setScreen('auth-signup')}
        />
      ) : screen === 'auth-signup' ? (
        <SignUpScreen
          onSignUp={handleAuthSuccess}
          onNavigateToSignIn={() => setScreen('auth-signin')}
        />
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {screen === 'dashboard' ? (
              <DashboardScreen
                onNavigateToHome={navigateToHome}
              />
            ) : screen === 'home' ? (
              <HomeView
                homeId={selectedHomeId || ''}
                onNavigateToRoom={navigateToRoom}
                onNavigateToDevice={navigateToDevice}
                onNavigateToProvisioning={navigateToProvisioning}
              />
            ) : screen === 'room' ? (
              <RoomView
                roomId={selectedRoomId || ''}
                onBack={() => setScreen('home')}
                onNavigateToDevice={navigateToDevice}
                onNavigateToProvisioning={navigateToProvisioning}
              />
            ) : screen === 'device' ? (
              <DeviceControlScreen
                deviceId={selectedDeviceId || ''}
                onBack={() => selectedRoomId ? setScreen('room') : setScreen('home')}
              />
            ) : screen === 'provisioning' ? (
              <ProvisioningScreen
                roomId={selectedRoomId || ''}
                                    onComplete={() => setScreen('room')}
                    onBack={() => selectedRoomId ? setScreen('room') : setScreen('home')}
              />
            ) : screen === 'automations' ? (
              <AutomationsScreen />
            ) : (
              <ProfileScreen />
            )}
          </View>

          <View style={styles.bottomNav}>
            <TouchableOpacity
              style={[styles.bottomNavBtn, (screen === 'dashboard' || screen === 'home' || screen === 'room' || screen === 'device' || screen === 'provisioning') && styles.bottomNavBtnActive]}
              onPress={() => setScreen('dashboard')}
            >
              <Text style={[styles.bottomNavText, (screen === 'dashboard' || screen === 'home' || screen === 'room' || screen === 'device' || screen === 'provisioning') && styles.bottomNavTextActive]}>🏠</Text>
              <Text style={[styles.bottomNavLabel, (screen === 'dashboard' || screen === 'home' || screen === 'room' || screen === 'device' || screen === 'provisioning') && styles.bottomNavLabelActive]}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bottomNavBtn, (screen === 'automations') && styles.bottomNavBtnActive]}
              onPress={() => setScreen('automations')}
            >
              <Text style={[styles.bottomNavText, (screen === 'automations') && styles.bottomNavTextActive]}>⚡</Text>
              <Text style={[styles.bottomNavLabel, (screen === 'automations') && styles.bottomNavLabelActive]}>Auto</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.bottomNavBtn, (screen === 'profile') && styles.bottomNavBtnActive]}
              onPress={() => setScreen('profile')}
            >
              <Text style={[styles.bottomNavText, (screen === 'profile') && styles.bottomNavTextActive]}>👤</Text>
              <Text style={[styles.bottomNavLabel, (screen === 'profile') && styles.bottomNavLabelActive]}>Profile</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingBottom: 20,
  },
  bottomNavBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomNavBtnActive: {
    opacity: 1,
  },
  bottomNavText: {
    fontSize: 20,
    color: '#666',
  },
  bottomNavTextActive: {
    color: '#007AFF',
  },
  bottomNavLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  bottomNavLabelActive: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
});

export default App;
