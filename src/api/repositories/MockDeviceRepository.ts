import { DeviceRepository } from '../deviceRepository';
import { Home, Room, SiriusDevice } from '../../types/home';
import persistentStorage from '../persistence/PersistentStorage';

class MockDeviceRepository implements DeviceRepository {
  private homes: Home[] = [];
  private devices: Record<string, SiriusDevice> = {};

  async init(): Promise<void> {
    try {
      const state = await persistentStorage.loadState();
      if (state.homes && state.homes.length > 0) {
        this.homes = state.homes;
      }
      if (state.devices && state.devices.length > 0) {
        const deviceRecord: Record<string, SiriusDevice> = {};
        state.devices.forEach((d, index) => {
          // Use existing ID if available, otherwise derive one
          const id = d.id || `dev-${index}`;
          deviceRecord[id] = d;
        });
        this.devices = deviceRecord;
      }
    } catch (e) {
      console.error('MockDeviceRepository: Init failed', e);
    }
  }

  private async save() {
    await persistentStorage.saveState({
      homes: this.homes,
      devices: Object.values(this.devices),
    });
  }

  async getHomes(): Promise<Home[]> {
    return this.homes;
  }

  async getHomeStats(homeId: string): Promise<{ totalDevices: number, activeDevices: number }> {
    const home = this.homes.find(h => h.id === homeId);
    if (!home) throw new Error('Home not found');

    let total = 0;
    let active = 0;

    for (const room of home.rooms) {
      const devices = Object.values(this.devices).filter(d => d.roomId === room.id);
      total += devices.length;
      active += devices.filter(d => d.powerState === 'on').length;
    }

    return { totalDevices: total, activeDevices: active };
  }

  async getHome(id: string): Promise<Home> {
    const home = this.homes.find(h => h.id === id);
    if (!home) throw new Error(`Home ${id} not found`);
    return { ...home };
  }

  async addHome(name: string): Promise<Home> {
    const newHome: Home = {
      id: `home-${this.homes.length + 1}`,
      name,
      rooms: [],
    };
    this.homes.push(newHome);
    await this.save();
    return newHome;
  }

  async addRoom(homeId: string, name: string, type: string): Promise<Room> {
    const home = this.homes.find(h => h.id === homeId);
    if (!home) throw new Error('Home not found');

    const newRoom: Room = {
      id: `room-${Math.random().toString(36).substr(2, 9)}`,
      name,
      type,
      devices: [],
    };
    home.rooms.push(newRoom);
    await this.save();
    return newRoom;
  }

  async getDevice(id: string): Promise<SiriusDevice> {
    const device = this.devices[id];
    if (!device) throw new Error(`Device ${id} not found`);
    return { ...device };
  }

  async getDevicesInRoom(roomId: string): Promise<SiriusDevice[]> {
    return Object.values(this.devices).filter(d => d.roomId === roomId);
  }

  async addDevice(roomId: string, name: string, ip?: string): Promise<SiriusDevice> {
    const deviceId = `dev-${Math.random().toString(36).substr(2, 9)}`;
    const newDevice: SiriusDevice = {
      factoryId: `ESP32-${Math.random().toString(36).toUpperCase().substr(2, 12)}`,
      displayName: name,
      ipAddress: ip || '192.168.1.100:80',
      powerState: 'off',
      rssi: -60,
      connectionStatus: 'online',
      firmwareVersion: '1.0.0',
      roomId: roomId,
      type: 'relay',
      channels: [{ id: 'ch-1', name: 'Main', powerState: 'off' }],
    };
    this.devices[deviceId] = newDevice;

    this.addDeviceToRoom(roomId, deviceId);
    await this.save();

    return newDevice;
  }

  async removeDeviceFromRoom(roomId: string, deviceId: string): Promise<void> {
    const home = this.homes.find(h => h.rooms.some(r => r.id === roomId));
    if (home) {
      const room = home.rooms.find(r => r.id === roomId);
      if (room) {
        room.devices = room.devices.filter(id => id !== deviceId);
        await this.save();
      }
    } else {
      throw new Error(`Room ${roomId} not found in any home`);
    }
  }

  async removeDevice(deviceId: string): Promise<void> {
    const device = this.devices[deviceId];
    if (!device) throw new Error('Device not found');

    const roomId = device.roomId;
    delete this.devices[deviceId];

    // Remove from room list
    const home = this.homes.find(h => h.rooms.some(r => r.id === roomId));
    if (home) {
      const room = home.rooms.find(r => r.id === roomId);
      if (room) {
        room.devices = room.devices.filter(id => id !== deviceId);
      }
    }

    await this.save();
  }

  async renameDevice(deviceId: string, newName: string): Promise<void> {
    const device = this.devices[deviceId];
    if (!device) throw new Error('Device not found');
    if (!newName || newName.trim().length === 0) {
      throw new Error('Device name cannot be empty');
    }
    device.displayName = newName.trim();
    await this.save();
  }

  async moveDevice(deviceId: string, newRoomId: string): Promise<void> {
    const device = this.devices[deviceId];
    if (!device) throw new Error('Device not found');

    const oldRoomId = device.roomId;
    if (oldRoomId === newRoomId) return;

    // Remove from old room
    const homeOld = this.homes.find(h => h.rooms.some(r => r.id === oldRoomId));
    if (homeOld) {
      const roomOld = homeOld.rooms.find(r => r.id === oldRoomId);
      if (roomOld) {
        roomOld.devices = roomOld.devices.filter(id => id !== deviceId);
      }
    }

    // Add to new room
    this.addDeviceToRoom(newRoomId, deviceId);
    device.roomId = newRoomId;

    await this.save();
  }

  async addDeviceToRoom(roomId: string, deviceId: string): Promise<void> {
    const home = this.homes.find(h => h.rooms.some(r => r.id === roomId));
    if (home) {
      const room = home.rooms.find(r => r.id === roomId);
      if (room && !room.devices.includes(deviceId)) {
        room.devices.push(deviceId);
        await this.save();
      }
    } else {
      throw new Error(`Room ${roomId} not found in any home`);
    }
  }

  async setPower(deviceId: string, channelId: string, state: 'on' | 'off'): Promise<{ success: boolean, newState: 'on' | 'off' }> {
    const device = this.devices[deviceId];
    if (!device) throw new Error('Device not found');

    const channel = device.channels.find(c => c.id === channelId);
    if (!channel) throw new Error('Channel not found');

    channel.powerState = state;
    device.powerState = device.channels.every(c => c.powerState === 'on') ? 'on' :
                        device.channels.every(c => c.powerState === 'off') ? 'off' : 'unknown';

    return { success: true, newState: state };
  }

  async getState(deviceId: string): Promise<SiriusDevice> {
    return this.getDevice(deviceId);
  }
}

export default new MockDeviceRepository();
