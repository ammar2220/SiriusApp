import { DeviceRepository } from '../deviceRepository';
import { SiriusDevice, Home, Room } from '../../types/home';
import apiClient from '../local/apiClient';
import persistentStorage from '../persistence/PersistentStorage';
import { NativeModules } from 'react-native';

const { DeviceDiscoveryModule } = NativeModules;

class LocalEsp32DeviceRepository implements DeviceRepository {
  // Stores real physical devices discovered/provisioned
  // Key: factoryId, Value: device config
  private deviceMap: Record<string, { ip: string, name: string }> = {
    'ESP32-80:f3:da:5e:1b:ec': { ip: '192.168.1.8:80', name: 'ESP32 Prototype' },
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

  async getPhysicalDevices(): Promise<Record<string, { ip: string, name: string }>> {
    return { ...this.deviceMap };
  }

  async save() {
    await persistentStorage.saveState({
      physicalDevices: this.deviceMap,
    });
  }

  private async _fetchDeviceData(ip: string): Promise<SiriusDevice> {
    const info = await apiClient.getInfo(ip);
    const state = await apiClient.getState(ip);

    const channelCount = state.channels.length;
    const channelNames = ['Main', 'Secondary', 'Auxiliary'];

    const mappedChannels = state.channels.map((ch, idx) => ({
      id: `ch-${ch.index}`,
      index: ch.index,
      name: channelNames[idx] || `Channel ${idx + 1}`,
      state: ch.state,
      capabilities: ['switch'],
    }));

    const powerState = mappedChannels.some(c => c.state === 'on') ? 'on' :
                       mappedChannels.every(c => c.state === 'off') ? 'off' : 'unknown';

    const productCode = channelCount === 1 ? 'SIRIUS_SWITCH_1CH' :
                        channelCount === 2 ? 'SIRIUS_SWITCH_2CH' :
                        channelCount === 3 ? 'SIRIUS_SWITCH_3CH' : 'SIRIUS_SWITCH_1CH';

    const productNames: Record<string, string> = {
      'SIRIUS_SWITCH_1CH': 'Sirius 1-Channel Switch',
      'SIRIUS_SWITCH_2CH': 'Sirius 2-Channel Switch',
      'SIRIUS_SWITCH_3CH': 'Sirius 3-Channel Switch',
    };

    return {
      factoryId: info.id,
      displayName: '', // Will be filled by the caller using deviceMap
      ipAddress: ip,
      powerState,
      rssi: state.rssi,
      connectionStatus: 'online',
      firmwareVersion: info.ver,
      roomId: '', // Will be filled by the caller
      homeId: '', // Will be filled by the caller
      type: 'relay',
      product: {
        code: productCode,
        name: productNames[productCode] || 'Sirius Switch',
        channelCount: channelCount,
        capabilities: ['switch'],
      },
      channels: mappedChannels,
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

  async getHomes(userId: string): Promise<Home[]> {
    return [];
  }

  async renameHome(homeId: string, newName: string): Promise<void> {
    throw new Error('Home management is handled by the primary repository');
  }

  async deleteHome(homeId: string): Promise<void> {
    throw new Error('Home management is handled by the primary repository');
  }

  async renameRoom(homeId: string, roomId: string, newName: string): Promise<void> {
    throw new Error('Room management is handled by the primary repository');
  }

  async getHomeStats(homeId: string): Promise<{ totalDevices: number, activeDevices: number }> {
    return { totalDevices: 0, activeDevices: 0 };
  }

  async getHome(id: string): Promise<Home> {
    throw new Error('Home management is handled by the primary repository');
  }

  async getDevice(id: string): Promise<SiriusDevice> {
    return this.executeWithRecovery(id, async (ip) => {
      const data = await this._fetchDeviceData(ip);
      const config = this.deviceMap[id];
      return {
        ...data,
        displayName: config?.name || '',
      };
    }).catch(async (e) => {
      // If recovery also fails, return the offline fallback object
      const config = this.deviceMap[id];
      return {
        factoryId: id,
        displayName: config?.name || 'Unknown Device',
        ipAddress: config?.ip || 'unknown',
        powerState: 'unknown',
        rssi: 0,
        connectionStatus: 'offline',
        firmwareVersion: 'unknown',
        roomId: '',
        homeId: '',
        type: 'relay',
        product: {
          code: 'SIRIUS_SWITCH_1CH',
          name: 'Sirius 1-Channel Switch',
          channelCount: 1,
          capabilities: ['switch'],
        },
        channels: [{ id: 'ch-1', index: 1, name: 'Main', state: 'unknown', capabilities: ['switch'] }],
      };
    });
  }

  async getDevicesInRoom(homeId: string, roomId: string): Promise<SiriusDevice[]> {
    return []; // Now handled by CompositeDeviceRepository via the authoritative hierarchy
  }

  async addDevice(homeId: string, roomId: string, name: string, ip?: string): Promise<SiriusDevice> {
    const deviceIp = ip || '192.168.1.8:80';

    try {
      const info = await apiClient.getInfo(deviceIp);
      const factoryId = info.id;

      this.deviceMap[factoryId] = {
        ip: deviceIp,
        name,
      };

      // REMOVED: await this.save();
      // Saving is now handled by the Composite repository to avoid race conditions.

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

  async moveDevice(deviceId: string, newRoomId: string, newHomeId: string): Promise<void> {
    // Hierarchy movement is now authoritative in MockDeviceRepository
  }

  async setChannelState(deviceId: string, channelId: string, state: 'on' | 'off'): Promise<{ success: boolean, newState: 'on' | 'off' }> {
    return this.executeWithRecovery(deviceId, async (ip) => {
      // Map channelId 'ch-X' to index X
      const channelIndex = parseInt(channelId.replace('ch-', ''), 10) || 1;
      await apiClient.setChannelState(ip, channelIndex, state);
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
      };
    });
  }
}

export default new LocalEsp32DeviceRepository();
