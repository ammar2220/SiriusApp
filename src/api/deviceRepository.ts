import { SiriusDevice, Home, Room } from '../types/home';

export interface DeviceRepository {
  // Home Management
  getHomes(): Promise<Home[]>;
  getHome(id: string): Promise<Home>;
  addHome(name: string): Promise<Home>;
  addRoom(homeId: string, name: string, type: string): Promise<Room>;

  // Device Management
  getDevice(id: string): Promise<SiriusDevice>;
  getDevicesInRoom(roomId: string): Promise<SiriusDevice[]>;
  addDevice(roomId: string, name: string, ip?: string): Promise<SiriusDevice>;
  removeDevice(deviceId: string): Promise<void>;
  renameDevice(deviceId: string, newName: string): Promise<void>;
  moveDevice(deviceId: string, newRoomId: string): Promise<void>;
  getHomeStats(homeId: string): Promise<{ totalDevices: number, activeDevices: number }>;

  // Control
  setPower(deviceId: string, channelId: string, state: 'on' | 'off'): Promise<{ success: boolean, newState: 'on' | 'off' }>;
  getState(deviceId: string): Promise<SiriusDevice>;
}
