import { DeviceRepository } from '../deviceRepository';
import { Home, Room, SiriusDevice } from '../../types/home';
import MockDeviceRepository from './MockDeviceRepository';
import LocalEsp32DeviceRepository from './LocalEsp32DeviceRepository';

class CompositeDeviceRepository implements DeviceRepository {
  private mockRepo = MockDeviceRepository;
  private localRepo = LocalEsp32DeviceRepository;

  async init(): Promise<void> {
    await Promise.all([
      this.mockRepo.init(),
      this.localRepo.init(),
    ]);
  }

  async getHomes(): Promise<Home[]> {
    // Default to mock homes for the overall structure
    return this.mockRepo.getHomes();
  }

  async getHomeStats(homeId: string): Promise<{ totalDevices: number, activeDevices: number }> {
    const home = await this.getHome(homeId);
    let total = 0;
    let active = 0;

    for (const room of home.rooms) {
      const devices = await this.getDevicesInRoom(room.id);
      total += devices.length;
      active += devices.filter(d => d.powerState === 'on').length;
    }

    return { totalDevices: total, activeDevices: active };
  }

  async getHome(id: string): Promise<Home> {
    return this.mockRepo.getHome(id);
  }

  async addHome(name: string): Promise<Home> {
    return this.mockRepo.addHome(name);
  }

  async addRoom(homeId: string, name: string, type: string): Promise<Room> {
    return this.mockRepo.addRoom(homeId, name, type);
  }

  async getDevice(id: string): Promise<SiriusDevice> {
    try {
      // Try local first (real devices)
      return await this.localRepo.getDevice(id);
    } catch {
      // Fallback to mock
      return await this.mockRepo.getDevice(id);
    }
  }

  async getDevicesInRoom(roomId: string): Promise<SiriusDevice[]> {
    const mockDevices = await this.mockRepo.getDevicesInRoom(roomId);
    const localDevices = await this.localRepo.getDevicesInRoom(roomId);
    return [...mockDevices, ...localDevices];
  }

  async addDevice(roomId: string, name: string, ip?: string): Promise<SiriusDevice> {
    if (ip) {
      // 1. Register in local repository (returns device with factoryId as id)
      const device = await this.localRepo.addDevice(roomId, name, ip);

      // 2. Link the physical device ID to the logical room in the mock hierarchy
      await this.mockRepo.addDeviceToRoom(roomId, device.factoryId);

      return device;
    }
    // Otherwise, add as a mock device
    return this.mockRepo.addDevice(roomId, name);
  }

  async setPower(deviceId: string, channelId: string, state: 'on' | 'off'): Promise<{ success: boolean, newState: 'on' | 'off' }> {
    try {
      // Try local first
      return await this.localRepo.setPower(deviceId, channelId, state);
    } catch {
      // Fallback to mock
      return await this.mockRepo.setPower(deviceId, channelId, state);
    }
  }

  async getState(deviceId: string): Promise<SiriusDevice> {
    try {
      return await this.localRepo.getState(deviceId);
    } catch {
      return await this.mockRepo.getState(deviceId);
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

  async moveDevice(deviceId: string, newRoomId: string): Promise<void> {
    const device = await this.getDevice(deviceId);
    const oldRoomId = device.roomId;
    if (oldRoomId === newRoomId) return;

    try {
      // Try moving as a real device first
      await this.localRepo.moveDevice(deviceId, newRoomId);

      // If that worked, it's a real device. We MUST update the room hierarchy in mockRepo.
      // We don't call mockRepo.moveDevice because that requires the device to be in mockRepo.devices.
      await this.mockRepo.removeDeviceFromRoom(oldRoomId, deviceId);
      await this.mockRepo.addDeviceToRoom(newRoomId, deviceId);
    } catch (e: any) {
      if (e.message === 'Device not found') {
        // Fallback: move as a mock device
        await this.mockRepo.moveDevice(deviceId, newRoomId);
      } else {
        throw e;
      }
    }
  }
}

export default new CompositeDeviceRepository();
