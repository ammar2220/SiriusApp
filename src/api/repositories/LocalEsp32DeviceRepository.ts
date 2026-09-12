import { DeviceRepository } from '../deviceRepository';
import { SiriusDevice, Home, Room } from '../../types/home';
import apiClient from '../local/apiClient';
import persistentStorage from '../persistence/PersistentStorage';
import { NativeModules } from 'react-native';

const { DeviceDiscoveryModule } = NativeModules;

class LocalEsp32DeviceRepository implements DeviceRepository {
  // Stores real physical devices discovered/provisioned
  // Key: factoryId, Value: device config
  private deviceMap: Record<string, { ip: string, name: string, roomId: string }> = {
    'ESP32-80:f3:da:5e:1b:ec': { ip: '192.168.1.8:80', name: 'ESP32 Prototype', roomId: 'room-1' },
  };

  async init(): Promise<void> {
    try {
      const state = await persistentStorage.loadState();
      if (state.physicalDevices && Object.keys(state.physicalDevices).length > 0) {
        this.deviceMap = state.physicalDevices;
      }
    } catch (e) {
      console.error('LocalEsp32DeviceRepository: Init failed', e);
    }
  }

  private async save() {
    await persistentStorage.saveState({
      physicalDevices: this.deviceMap,
    });
  }

  private async _fetchDeviceData(ip: string): Promise<SiriusDevice> {
    const info = await apiClient.getInfo(ip);
    const state = await apiClient.getState(ip);

    return {
      factoryId: info.id,
      displayName: '', // Will be filled by the caller using deviceMap
      ipAddress: ip,
      powerState: state.power as 'on' | 'off',
      rssi: state.rssi,
      connectionStatus: 'online',
      firmwareVersion: info.ver,
      roomId: '', // Will be filled by the caller
      type: 'relay',
      channels: [{ id: 'ch-1', name: 'Main', powerState: state.power as 'on' | 'off' }],
    };
  }

  private async recoverDeviceIp(deviceId: string): Promise<string | null> {
    console.log(`[DeviceRecovery] Starting mDNS discovery for device: ${deviceId}`);
    try {
      const discoveryResult = await DeviceDiscoveryModule.discoverDevice('_http._tcp');
      const host = `${discoveryResult.host}:${discoveryResult.port}`;
      console.log(`[DeviceRecovery] Candidate discovered at ${host}, verifying identity...`);

      const info = await apiClient.getInfo(host);
      if (info.id === deviceId) {
        console.log(`[DeviceRecovery] Factory ID matched: ${info.id}. Updating cached IP.`);
        this.deviceMap[deviceId].ip = host;
        await this.save();
        return host;
      } else {
        console.log(`[DeviceRecovery] Factory ID mismatch. Expected ${deviceId}, got ${info.id}. Ignoring candidate.`);
      }
    } catch (e: any) {
      console.log(`[DeviceRecovery] Recovery failed: ${e.message}`);
    }
    return null;
  }

  private async executeWithRecovery<T>(deviceId: string, operation: (ip: string) => Promise<T>): Promise<T> {
    const config = this.deviceMap[deviceId];
    if (!config) throw new Error('Device not found');

    try {
      console.log(`[DeviceRecovery] Requesting cached IP: ${config.ip}`);
      return await operation(config.ip);
    } catch (e: any) {
      console.log(`[DeviceRecovery] Cached IP request failed: ${e.message}`);

      const newIp = await this.recoverDeviceIp(deviceId);
      if (newIp) {
        console.log(`[DeviceRecovery] Retrying original request with recovered IP: ${newIp}`);
        return await operation(newIp);
      }

      console.log(`[DeviceRecovery] Recovery unsuccessful. Returning original error.`);
      throw e;
    }
  }

  async addHome(name: string): Promise<Home> {
    throw new Error('Adding homes is not supported for local devices');
  }

  async addRoom(homeId: string, name: string, type: string): Promise<Room> {
    throw new Error('Adding rooms is not supported for local devices');
  }

  async getHomes(): Promise<Home[]> {
    return [];
  }

  async getHomeStats(homeId: string): Promise<{ totalDevices: number, activeDevices: number }> {
    return { totalDevices: 0, activeDevices: 0 };
  }

  async getHome(id: string): Promise<Home> {
    throw new Error('Home management is handled by the primary repository');
  }

  async getDevice(id: string): Promise<SiriusDevice> {
    const config = this.deviceMap[id];
    if (!config) throw new Error('Device not found');

    try {
      const data = await this._fetchDeviceData(config.ip);
      return {
        ...data,
        displayName: config.name,
        roomId: config.roomId,
      };
    } catch (e) {
      return {
        factoryId: id,
        displayName: config.name,
        ipAddress: config.ip,
        powerState: 'unknown',
        rssi: 0,
        connectionStatus: 'offline',
        firmwareVersion: 'unknown',
        roomId: config.roomId,
        type: 'relay',
        channels: [{ id: 'ch-1', name: 'Main', powerState: 'unknown' }],
      };
    }
  }

  async getDevicesInRoom(roomId: string): Promise<SiriusDevice[]> {
    const devicesInRoom = Object.entries(this.deviceMap)
      .filter(([_, config]) => config.roomId === roomId)
      .map(([id, _]) => id);

    return await Promise.all(
      devicesInRoom.map(id => this.getDevice(id))
    );
  }

  async addDevice(roomId: string, name: string, ip?: string): Promise<SiriusDevice> {
    const deviceIp = ip || '192.168.1.8:80';

    try {
      const info = await apiClient.getInfo(deviceIp);
      const factoryId = info.id;

      this.deviceMap[factoryId] = {
        ip: deviceIp,
        name,
        roomId
      };

      await this.save();

      return this.getDevice(factoryId);
    } catch (e: any) {
      throw new Error(`Failed to verify physical device at ${deviceIp}: ${e.message}`);
    }
  }

  async removeDevice(deviceId: string): Promise<void> {
    if (!this.deviceMap[deviceId]) {
      throw new Error('Device not found');
    }
    delete this.deviceMap[deviceId];
    await this.save();
  }

  async resetDevice(deviceId: string): Promise<{ success: boolean }> {
    const config = this.deviceMap[deviceId];
    if (!config) {
      throw new Error('Device not found');
    }

    try {
      const result = await apiClient.resetProvisioning(config.ip);
      if (result.status === 'resetting') {
        return { success: true };
      }
      throw new Error(`Unexpected reset status: ${result.status}`);
    } catch (e: any) {
      console.error(`[LocalRepo] Remote reset failed for ${deviceId}: ${e.message}`);
      throw new Error(`Unable to reset the device: ${e.message}`);
    }
  }

  async renameDevice(deviceId: string, newName: string): Promise<void> {
    if (!this.deviceMap[deviceId]) {
      throw new Error('Device not found');
    }
    if (!newName || newName.trim().length === 0) {
      throw new Error('Device name cannot be empty');
    }
    this.deviceMap[deviceId].name = newName.trim();
    await this.save();
  }

  async moveDevice(deviceId: string, newRoomId: string): Promise<void> {
    if (!this.deviceMap[deviceId]) {
      throw new Error('Device not found');
    }
    this.deviceMap[deviceId].roomId = newRoomId;
    await this.save();
  }

  async setPower(deviceId: string, channelId: string, state: 'on' | 'off'): Promise<{ success: boolean, newState: 'on' | 'off' }> {
    return this.executeWithRecovery(deviceId, async (ip) => {
      await apiClient.setPower(ip, state);
      return { success: true, newState: state };
    });
  }

  async getState(deviceId: string): Promise<SiriusDevice> {
    return this.executeWithRecovery(deviceId, async (ip) => {
      const data = await this._fetchDeviceData(ip);
      const config = this.deviceMap[deviceId];
      return {
        ...data,
        displayName: config?.name || '',
        roomId: config?.roomId || '',
      };
    });
  }
}

export default new LocalEsp32DeviceRepository();
