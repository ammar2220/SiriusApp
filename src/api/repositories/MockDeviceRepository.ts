import { DeviceRepository } from '../deviceRepository';
import { Home, Room, SiriusDevice, SiriusProduct } from '../../types/home';
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
      devices: Object.entries(this.devices).map(([id, device]) => ({
        ...device,
        id,
      })),
    });
  }

  async getHomes(userId: string): Promise<Home[]> {
    return this.homes.filter(h => h.userId === userId);
  }

  async getHomeStats(homeId: string): Promise<{ totalDevices: number, activeDevices: number }> {
    const home = this.homes.find(h => h.id === homeId);
    if (!home) throw new Error('Home not found');

    let total = 0;
    let active = 0;

    for (const room of home.rooms) {
      const devices = Object.values(this.devices).filter(d => d.roomId === room.id);
      total += devices.length;
      active += devices.filter(d => d.channels.some(c => c.state === 'on')).length;
    }

    return { totalDevices: total, activeDevices: active };
  }

  async getHome(id: string, userId: string): Promise<Home> {
    const home = this.homes.find(h => h.id === id && h.userId === userId);
    if (!home) throw new Error(`Home ${id} not found for user ${userId}`);
    return { ...home };
  }

  async addHome(userId: string, name: string): Promise<Home> {
    const newHome: Home = {
      id: `home-${this.homes.length + 1}`,
      userId,
      name,
      rooms: [],
    };
    this.homes.push(newHome);
    await this.save();
    return newHome;
  }

  async renameHome(homeId: string, newName: string): Promise<void> {
    const home = this.homes.find(h => h.id === homeId);
    if (!home) throw new Error(`Home ${homeId} not found`);
    home.name = newName;
    await this.save();
  }

  async deleteHome(homeId: string): Promise<void> {
    const home = this.homes.find(h => h.id === homeId);
    if (!home) throw new Error(`Home ${homeId} not found`);

    this.homes = this.homes.filter(h => h.id !== homeId);

    const devicesToRemove: string[] = [];
    for (const [id, device] of Object.entries(this.devices)) {
      if (device.homeId === homeId) {
        devicesToRemove.push(id);
      }
    }

    devicesToRemove.forEach(id => {
      delete this.devices[id];
    });

    await this.save();
  }

  async deleteRoom(homeId: string, roomId: string): Promise<void> {
    const home = this.homes.find(h => h.id === homeId);
    if (!home) throw new Error('Home not found');

    const roomIndex = home.rooms.findIndex(r => r.id === roomId);
    if (roomIndex === -1) throw new Error('Room not found');

    home.rooms.splice(roomIndex, 1);

    const devicesToRemove: string[] = [];
    for (const [id, device] of Object.entries(this.devices)) {
      if (device.roomId === roomId) {
        devicesToRemove.push(id);
      }
    }

    devicesToRemove.forEach(id => {
      delete this.devices[id];
    });

    await this.save();
  }


  async addRoom(homeId: string, name: string, type: string): Promise<Room> {
    const home = this.homes.find(h => h.id === homeId);
    if (!home) throw new Error('Home not found');

    const newRoom: Room = {
      id: `room-${Math.random().toString(36).substr(2, 9)}`,
      name,
      type,
      homeId,
      devices: [],
    };
    home.rooms.push(newRoom);
    await this.save();
    return newRoom;
  }

  async renameRoom(homeId: string, roomId: string, newName: string): Promise<void> {
    const home = this.homes.find(h => h.id === homeId);
    if (!home) throw new Error('Home not found');

    const room = home.rooms.find(r => r.id === roomId);
    if (!room) throw new Error('Room not found in home');

    room.name = newName;
    await this.save();
  }

  async getDevice(id: string): Promise<SiriusDevice> {
    const device = this.devices[id];
    if (!device) throw new Error(`Device ${id} not found`);
    return { ...device };
  }

  async findRoomForDevice(deviceId: string): Promise<{ roomId: string, homeId: string } | null> {
    for (const home of this.homes) {
      for (const room of home.rooms) {
        if (room.devices.includes(deviceId)) {
          return { roomId: room.id, homeId: home.id };
        }
      }
    }
    return null;
  }

  async getDevicesInRoom(homeId: string, roomId: string): Promise<SiriusDevice[]> {
    const home = this.homes.find(h => h.id === homeId);
    if (!home) throw new Error('Home not found');

    const room = home.rooms.find(r => r.id === roomId);
    if (!room) throw new Error('Room not found in home');

    return Object.values(this.devices).filter(d => room.devices.includes(d.factoryId));
  }

  async addDevice(homeId: string, roomId: string, name: string, ip?: string): Promise<SiriusDevice> {
    const deviceId = `dev-${Math.random().toString(36).substr(2, 9)}`;

    const product: SiriusProduct = {
      code: 'SIRIUS_SWITCH_1CH',
      name: 'Sirius 1-Channel Switch',
      channelCount: 1,
      capabilities: ['switch'],
    };

    const newDevice: SiriusDevice = {
      factoryId: `ESP32-${Math.random().toString(36).toUpperCase().substr(2, 12)}`,
      displayName: name,
      ipAddress: ip || '192.168.1.100:80',
      powerState: 'off',
      rssi: -60,
      connectionStatus: 'online',
      firmwareVersion: '1.0.0',
      roomId: roomId,
      homeId: homeId,
      product: product,
      type: 'relay',
      channels: [{
        id: 'channel-1',
        index: 1,
        name: 'Main',
        state: 'off',
        capabilities: product.capabilities
      }],
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

    if (device) {
      delete this.devices[deviceId];

      const roomId = device.roomId;
      const home = this.homes.find(h => h.rooms.some(r => r.id === roomId));
      if (home) {
        const room = home.rooms.find(r => r.id === roomId);
        if (room) {
          room.devices = room.devices.filter(id => id !== deviceId);
        }
      }
    } else {
      // Physical device may exist only in the Room hierarchy.
      for (const home of this.homes) {
        for (const room of home.rooms) {
          room.devices = room.devices.filter(id => id !== deviceId);
        }
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

  async moveDevice(deviceId: string, newRoomId: string, newHomeId: string): Promise<void> {
    // Remove from all rooms first
    for (const home of this.homes) {
      for (const room of home.rooms) {
        if (room.devices.includes(deviceId)) {
          room.devices = room.devices.filter(id => id !== deviceId);
        }
      }
    }

    // Add to new room
    this.addDeviceToRoom(newRoomId, deviceId);

    // Update logical device record if it exists
    const device = this.devices[deviceId];
    if (device) {
      device.roomId = newRoomId;
      device.homeId = newHomeId;
    }

    await this.save();
  }

  async addDeviceToRoom(roomId: string, deviceId: string): Promise<void> {
    // 1. Prevent duplicate membership: Remove device from all rooms across all homes
    for (const home of this.homes) {
      for (const room of home.rooms) {
        room.devices = room.devices.filter(id => id !== deviceId);
      }
    }

    // 2. Add to the target room
    const targetHome = this.homes.find(h => h.rooms.some(r => r.id === roomId));
    if (targetHome) {
      const targetRoom = targetHome.rooms.find(r => r.id === roomId);
      if (targetRoom && !targetRoom.devices.includes(deviceId)) {
        targetRoom.devices.push(deviceId);
        await this.save();
      }
    } else {
      throw new Error(`Room ${roomId} not found in any home`);
    }
  }

  async setChannelState(deviceId: string, channelId: string, state: 'on' | 'off'): Promise<{ success: boolean, newState: 'on' | 'off' }> {
    const device = this.devices[deviceId];
    if (!device) throw new Error('Device not found');

    const channel = device.channels.find(c => c.id === channelId);
    if (!channel) throw new Error('Channel not found');

    channel.state = state;
    device.powerState = device.channels.every(c => c.state === 'on') ? 'on' :
                        device.channels.every(c => c.state === 'off') ? 'off' : 'unknown';

    return { success: true, newState: state };
  }

  async getState(deviceId: string): Promise<SiriusDevice> {
    return this.getDevice(deviceId);
  }
}

export default new MockDeviceRepository();
