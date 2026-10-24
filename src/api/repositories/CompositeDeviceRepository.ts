import { DeviceRepository } from '../deviceRepository';
import { Home, Room, SiriusDevice } from '../../types/home';
import LocalEsp32DeviceRepository from './LocalEsp32DeviceRepository';
import CloudDeviceRepository from './CloudDeviceRepository';
import SessionManager from '../session/SessionManager';
import MigrationService from '../services/MigrationService';
import persistentStorage from '../persistence/PersistentStorage';
import ControlRouter from '../ControlRouter';
import { SiriusCommand, CommandResult } from '../../types/device';
import { v4 as uuidv4 } from 'uuid';
import RemoteControlService from '../remote/RemoteControlService';
import { supabase } from '../cloud/supabaseClient';

class CompositeDeviceRepository implements DeviceRepository {
  private localRepo = LocalEsp32DeviceRepository;
  private cloudRepo = CloudDeviceRepository;

  private async getActiveUserId(): Promise<string> {
    const session = await SessionManager.getSession();
    if (!session || !session.activeUserId) {
      throw new Error('Unauthorized: No active user session found.');
    }
    return session.activeUserId;
  }

  private async getActiveHomeId(roomId: string): Promise<string> {
    const userId = await this.getActiveUserId();
    const homes = await this.cloudRepo.getHomes();
    const home = homes.find(h => h.rooms.some(r => r.id === roomId));
    if (!home) {
      throw new Error('Unauthorized: Room not found in any of the user\'s homes.');
    }
    return home.id;
  }

  async init(): Promise<void> {
    await this.localRepo.init();
    const userId = await this.getActiveUserId();
    const migrationCompleted = await MigrationService.isMigrationCompleted();

    if (!migrationCompleted) {
      console.log('[CompositeRepo] Checking for pending migration...');
      await MigrationService.performMigration(userId);
    }
  }

  async getHomes(): Promise<Home[]> {
    return this.cloudRepo.getHomes();
  }

  async getHomeStats(homeId: string): Promise<{ totalDevices: number, activeDevices: number | null }> {
    const home = await this.getHome(homeId, await this.getActiveUserId());
    let total = 0;
    let active = 0;
    let hasUnknown = false;

    for (const room of home.rooms) {
      const devices = await this.getDevicesInRoom(homeId, room.id);
      total += devices.length;
      for (const device of devices) {
        if (!device.channels || device.channels.length === 0 || device.channels.some(ch => ch.state === 'unknown')) {
          hasUnknown = true;
        }
        // Count device as active if at least one channel is 'on'
        if (device.channels && device.channels.some(ch => ch.state === 'on')) {
          active += 1;
        }
      }
    }

    return {
      totalDevices: total,
      activeDevices: hasUnknown ? null : active
    };
  }

  async getHome(id: string, userId: string): Promise<Home> {
    return this.cloudRepo.getHome(id, userId);
  }

  async addHome(name: string): Promise<Home> {
    try {
      const userId = await this.getActiveUserId();
      return await this.cloudRepo.addHome(userId, name);
    } catch (e: any) {
      console.error('[CompositeRepo] addHome failed:', e);
      throw e;
    }
  }

  async renameHome(homeId: string, newName: string): Promise<void> {
    return this.cloudRepo.renameHome(homeId, newName);
  }

  async deleteHome(homeId: string): Promise<void> {
    return this.cloudRepo.deleteHome(homeId);
  }

  async addRoom(homeId: string, name: string, type: string): Promise<Room> {
    return this.cloudRepo.addRoom(homeId, name, type);
  }

  async renameRoom(homeId: string, roomId: string, newName: string): Promise<void> {
    return this.cloudRepo.renameRoom(homeId, roomId, newName);
  }

  async deleteRoom(homeId: string, roomId: string): Promise<void> {
    return this.cloudRepo.deleteRoom(homeId, roomId);
  }

  async getDevice(id: string): Promise<SiriusDevice> {
    try {
      // 1. Resolve Cloud UUID if we have a factoryId
      let cloudId = id;
      if (id.includes(':')) {
        try {
          cloudId = await this.cloudRepo.getDeviceIdByFactoryId(id);
        } catch (e) {
          console.warn(`[CompositeRepo] Could not resolve UUID for factoryId ${id}`);
        }
      }

      // 2. Try to find device in Local repo first (using factoryId)
      console.log(`[CompositeRepo-Trace] Requesting local device: ${id}`);
      const localDevice: SiriusDevice | null = await Promise.race([
        this.localRepo.getDevice(id, 'foreground-getDevice'),
        new Promise<never>((_, reject) => setTimeout(() => {
          console.log(`[CompositeRepo-Trace] Local request timeout (5s) for ${id}. Falling back to cloud.`);
          reject(new Error('timeout'));
        }, 5000))
      ]).catch((e) => {
        console.log(`[CompositeRepo-Trace] Local race settled: ${e.message}`);
        return null;
      });

      // 3. Fetch logical metadata from Cloud (using UUID)
      let cloudDevice: SiriusDevice | undefined;
      try {
        cloudDevice = await this.cloudRepo.getDevice(cloudId);
      } catch (e) {
        // If cloud lookup fails but we have a local device, we can still return it
        if (!localDevice) throw e;
      }

      if (localDevice && cloudDevice) {
        return {
          ...cloudDevice,
          displayName: cloudDevice.displayName, // Authoritative name from Supabase
          factoryId: localDevice.factoryId,
          ipAddress: localDevice.ipAddress,
          powerState: localDevice.powerState,
          rssi: localDevice.rssi,
          connectionStatus: localDevice.connectionStatus,
          firmwareVersion: localDevice.firmwareVersion,
          lastSeen: localDevice.lastSeen,
          channels: localDevice.channels,
          // The local REST snapshot is authoritative while the phone can see
          // the device on the LAN. Keep its command fence when combining it
          // with cloud-only metadata; otherwise a fresh local device cannot
          // construct a valid unified command before its first cloud uplink.
          sessionId: localDevice.sessionId ?? cloudDevice.sessionId,
          bootCount: localDevice.bootCount ?? cloudDevice.bootCount,
          revision: localDevice.revision ?? cloudDevice.revision,
          enrollmentGeneration:
            localDevice.enrollmentGeneration ?? cloudDevice.enrollmentGeneration,
        };
      }

      // Fallback to local device if cloud lookup failed to avoid "Device not found"
      if (localDevice) {
        return {
          ...localDevice,
          displayName: localDevice.displayName || 'Unknown Device',
          homeId: localDevice.homeId || 'pending',
          roomId: localDevice.roomId || 'pending',
        };
      }

      if (!cloudDevice) {
        throw new Error(`Device ${id} not found`);
      }
      return cloudDevice;
    } catch (e) {
      throw e;
    }
  }

  async getDevicesInRoom(homeId: string, roomId: string): Promise<SiriusDevice[]> {
    const cloudDevices = await this.cloudRepo.getDevicesInRoom(homeId, roomId);

    // Mark locally registered devices as 'connecting' immediately in the return list.
    // This ensures the UI renders 'Connecting...' instead of 'Offline'
    // before the background localRepo.getDevice() calls publish their updates.
    const physicalDevices = this.localRepo.getPhysicalDevicesSync();

    const devicesWithInitialStatus: SiriusDevice[] = cloudDevices.map(cloudDevice => {
      if (physicalDevices[cloudDevice.factoryId]) {
        return {
          ...cloudDevice,
          connectionStatus: 'connecting' as const,
        };
      }
      return cloudDevice;
    });

    // Trigger local lookups in the background.
    cloudDevices.forEach(cloudDevice => {
      this.localRepo.getDevice(cloudDevice.factoryId, 'background-room').catch(e =>
        console.error(`[CompositeRepo] Background local resolution failed for ${cloudDevice.factoryId}:`, e)
      );
    });

    return devicesWithInitialStatus;
  }

  async addDevice(roomId: string, name: string, ip?: string): Promise<SiriusDevice> {
    const homeId = await this.getActiveHomeId(roomId);
    const localDevice = await this.localRepo.addDevice(homeId, roomId, name, ip);
    const cloudDevice = await this.cloudRepo.addDevice(homeId, roomId, name, localDevice.factoryId, localDevice.product);
    await this.localRepo.save();

    return {
      ...cloudDevice,
      ipAddress: localDevice.ipAddress,
      powerState: localDevice.powerState,
      connectionStatus: localDevice.connectionStatus,
      channels: localDevice.channels,
      sessionId: localDevice.sessionId,
      bootCount: localDevice.bootCount,
      revision: localDevice.revision,
      enrollmentGeneration: cloudDevice.enrollmentGeneration,
    };
  }

  async setChannelState(deviceId: string, channelId: string, state: 'on' | 'off'): Promise<CommandResult> {
    try {
      // Resolve the absolute state of the device first to construct the safety fence
      const device = await this.getDevice(deviceId);

      if (
        !device ||
        device.sessionId === undefined || device.sessionId === 'offline' ||
        device.bootCount === undefined || device.bootCount <= 0 ||
        device.revision === undefined || device.revision < 0 ||
        device.enrollmentGeneration === undefined ||
        !Number.isSafeInteger(device.enrollmentGeneration) || device.enrollmentGeneration <= 0
      ) {
        throw new Error('Device identity unknown or offline; cannot construct safety fence parameters');
      }

      const command: SiriusCommand = {
        commandId: uuidv4(),
        deviceId: device.factoryId,
        enrollmentGeneration: device.enrollmentGeneration,
        expectedSessionId: device.sessionId,
        expectedRevision: device.revision,
        expectedBootCount: device.bootCount,
        expiresAt: Date.now() + 60000, // 60s TTL
        target: {
          channel: parseInt(channelId.replace('ch-', ''), 10) || 1,
          action: 'SET_STATE',
          value: state,
        },
        source: 'LOCAL_APP',
        timestamp: Date.now(),
      };

      return await ControlRouter.execute(command);
    } catch (e) {
      console.error(`[CompositeRepo] Unified control failed:`, e);
      return {
        status: 'rejected',
        commandId: `err-${deviceId}-${Date.now()}`,
        reason: e instanceof Error ? e.message : 'Internal repository error',
      };
    }
  }

  async pollCommandStatus(commandId: string): Promise<CommandResult> {
    return await RemoteControlService.pollStatus(commandId);
  }

  async getState(deviceId: string): Promise<SiriusDevice> {
    try {
      return await this.localRepo.getState(deviceId);
    } catch {
      throw new Error(`Device ${deviceId} state unavailable`);
    }
  }

  async removeDevice(deviceId: string): Promise<void> {
    const userId = await this.getActiveUserId();

    let cloudId = deviceId;
    if (deviceId.includes(':')) {
      try {
        cloudId = await this.cloudRepo.getDeviceIdByFactoryId(deviceId);
      } catch (e) {
        console.error('[CompositeRepo] Error resolving factoryId for removal:', e);
      }
    }

    await this.cloudRepo.removeDevice(cloudId);
    const device = await this.localRepo.getDevice(deviceId).catch(() => null);
    if (device) {
      await this.localRepo.resetDevice(deviceId);
      await this.localRepo.removeDevice(deviceId).catch(() => {});
    }
  }

  async renameDevice(deviceId: string, newName: string): Promise<void> {
    let cloudId = deviceId;
    if (deviceId.includes(':')) {
      try {
        cloudId = await this.cloudRepo.getDeviceIdByFactoryId(deviceId);
        } catch (e) {
          console.error('[CompositeRepo] Error resolving factoryId for rename:', e);
        }
    }
    await this.cloudRepo.renameDevice(cloudId, newName);

    try {
      await this.localRepo.renameDevice(deviceId, newName);
    } catch (e) {
      console.warn('[CompositeRepo] Could not update local name:', e);
    }
  }

  async moveDevice(deviceId: string, newRoomId: string, newHomeId: string): Promise<void> {
    let cloudId = deviceId;
    if (deviceId.includes(':')) {
      try {
        cloudId = await this.cloudRepo.getDeviceIdByFactoryId(deviceId);
      } catch (e) {
        console.error('[CompositeRepo] Error resolving factoryId for move:', e);
        throw new Error(`Could not resolve cloud ID for device ${deviceId}`);
      }
    }

    const device = await this.getDevice(cloudId);
    if (!device) {
      throw new Error('Device not found');
    }

    return this.cloudRepo.moveDevice(cloudId, newRoomId, newHomeId);
  }

  onDeviceUpdate(callback: (device: SiriusDevice) => void): () => void {
    const unsubscribeLocal = this.localRepo.onDeviceUpdate(callback);
    const channel = supabase
      .channel('device-state-updates')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'device_state',
      }, async (payload: any) => {
        const factoryId = payload.new?.factory_id;
        if (typeof factoryId !== 'string') return;
        try {
          callback(await this.cloudRepo.getDeviceByFactoryId(factoryId));
        } catch (error) {
          console.warn(`[CompositeRepo] Could not refresh cloud state for ${factoryId}:`, error);
        }
      })
      .subscribe();

    return () => {
      unsubscribeLocal();
      supabase.removeChannel(channel);
    };
  }
}

export default new CompositeDeviceRepository();
