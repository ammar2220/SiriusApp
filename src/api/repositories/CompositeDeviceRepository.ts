import { DeviceRepository } from '../deviceRepository';
import { Home, Room, SiriusDevice } from '../../types/home';
import MockDeviceRepository from './MockDeviceRepository';
import LocalEsp32DeviceRepository from './LocalEsp32DeviceRepository';
import SessionManager from '../session/SessionManager';
import persistentStorage from '../persistence/PersistentStorage';

class CompositeDeviceRepository implements DeviceRepository {
  private mockRepo = MockDeviceRepository;
  private localRepo = LocalEsp32DeviceRepository;

  async init(): Promise<void> {
    await Promise.all([
      this.mockRepo.init(),
      this.localRepo.init(),
    ]);
  }

  async getHomes(userId: string): Promise<Home[]> {
    // Default to mock homes for the overall structure
    return this.mockRepo.getHomes(userId);
  }

  async getHomeStats(homeId: string, userId: string): Promise<{ totalDevices: number, activeDevices: number }> {
    const home = await this.getHome(homeId, userId);
    let total = 0;
    let active = 0;

    for (const room of home.rooms) {
      const devices = await this.getDevicesInRoom(homeId, room.id);
      total += devices.length;
      active += devices.filter(d => d.channels.some(ch => ch.state === 'on')).length;
    }

    return { totalDevices: total, activeDevices: active };
  }

  async getHome(id: string, userId: string): Promise<Home> {
    return this.mockRepo.getHome(id, userId);
  }

  async addHome(userId: string, name: string): Promise<Home> {
    return this.mockRepo.addHome(userId, name);
  }

  async renameHome(homeId: string, newName: string): Promise<void> {
    return this.mockRepo.renameHome(homeId, newName);
  }

  async deleteHome(homeId: string): Promise<void> {
    return this.mockRepo.deleteHome(homeId);
  }

  async addRoom(homeId: string, name: string, type: string): Promise<Room> {
    return this.mockRepo.addRoom(homeId, name, type);
  }

  async renameRoom(homeId: string, roomId: string, newName: string): Promise<void> {
    return this.mockRepo.renameRoom(homeId, roomId, newName);
  }

  async deleteRoom(homeId: string, roomId: string): Promise<void> {
    return this.mockRepo.deleteRoom(homeId, roomId);
  }

  async getDevice(id: string): Promise<SiriusDevice> {
    try {
      // Try local first (real devices)
      let device = await this.localRepo.getDevice(id);

      // Resolve hierarchy from authoritative source
      const location = await this.mockRepo.findRoomForDevice(id);
      if (location) {
        device = { ...device, roomId: location.roomId, homeId: location.homeId };
      }

      return device;
    } catch {
      // Fallback to mock
      return await this.mockRepo.getDevice(id);
    }
  }

  async getDevicesInRoom(homeId: string, roomId: string): Promise<SiriusDevice[]> {
    const session = await SessionManager.getSession();
    const userId = session?.userId || 'user_legacy_v1';
    const home = await this.mockRepo.getHome(homeId, userId);
    const room = home.rooms.find(r => r.id === roomId);
    if (!room) throw new Error('Room not found');

    const deviceIds = room.devices;
    const resolvedDevices: SiriusDevice[] = [];

    for (const id of deviceIds) {
      try {
        let device = await this.getDevice(id);

        // Enrich with hierarchy info since the repo itself no longer stores it
        device = {
          ...device,
          homeId,
          roomId,
        };

        resolvedDevices.push(device);
      } catch (e) {
        // Silently skip devices that cannot be resolved (e.g., removed devices)
        // to avoid UI errors during state synchronization.
        continue;
      }
    }

    return resolvedDevices;
  }

  async addDevice(homeId: string, roomId: string, name: string, ip?: string): Promise<SiriusDevice> {
    if (ip) {
      // 1. Register in local repository in-memory state
      const device = await this.localRepo.addDevice(homeId, roomId, name, ip);

      // 2. Link the physical device ID to the logical room in the mock hierarchy in-memory state
      await this.mockRepo.addDeviceToRoom(roomId, device.factoryId);

      // 3. Perform ONE atomic persistence write containing both updates.
      // We obtain the current in-memory state from both repositories.
      const physicalDevices = await this.localRepo.getPhysicalDevices();
      const mockState = await this.mockRepo.getInternalState();

      await persistentStorage.saveState({
        physicalDevices,
        homes: mockState.homes,
        devices: mockState.devices,
      });

      return device;
    }
    // Otherwise, add as a mock device
    return this.mockRepo.addDevice(homeId, roomId, name);
  }

  async setChannelState(deviceId: string, channelId: string, state: 'on' | 'off'): Promise<{ success: boolean, newState: 'on' | 'off' }> {
    try {
      // Try local first
      return await this.localRepo.setChannelState(deviceId, channelId, state);
    } catch {
      // Fallback to mock
      return await this.mockRepo.setChannelState(deviceId, channelId, state);
    }
  }

  async getState(deviceId: string): Promise<SiriusDevice> {
    try {
      return await this.localRepo.getState(deviceId);
    } catch {
      return await this.mockRepo.getDeviceState(deviceId);
    }
  }

  async removeDevice(deviceId: string): Promise<void> {
    try {
      // 1. Identify if this is a physical device
      const device = await this.localRepo.getDevice(deviceId).catch(() => null);

      if (device) {
        // 2. Request remote provisioning reset on the ESP32
        await this.localRepo.resetDevice(deviceId);
      }

      // 3. Remove the device from both local mapping and mock hierarchy
      await this.localRepo.removeDevice(deviceId).catch(() => {});
      await this.mockRepo.removeDevice(deviceId).catch(() => {});
    } catch (e: any) {
      // If it was a physical device and the reset failed, we do NOT remove it locally
      // to avoid the "half-removed" state.
      throw e;
    }
  }

  async renameDevice(deviceId: string, newName: string): Promise<void> {
    try {
      await this.localRepo.renameDevice(deviceId, newName);
    } catch {
      await this.mockRepo.renameDevice(deviceId, newName);
    }
  }

  async moveDevice(deviceId: string, newRoomId: string, newHomeId: string): Promise<void> {
    // Delegate hierarchy move exclusively to MockDeviceRepository
    await this.mockRepo.moveDevice(deviceId, newRoomId, newHomeId);
  }
}

export default new CompositeDeviceRepository();
