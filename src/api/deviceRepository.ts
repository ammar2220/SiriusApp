import { SiriusDevice, Home, Room } from '../types/home';
import { CommandResult } from '../types/device';

export interface DeviceRepository {
  // Home Management
  getHomes(userId: string): Promise<Home[]>;
  getHome(id: string, userId: string): Promise<Home>;
  addHome(userId: string, name: string): Promise<Home>;
  renameHome(homeId: string, newName: string): Promise<void>;
  deleteHome(homeId: string): Promise<void>;
  addRoom(homeId: string, name: string, type: string): Promise<Room>;
  renameRoom(homeId: string, roomId: string, newName: string): Promise<void>;

  // Device Management
  getDevice(id: string): Promise<SiriusDevice>;
  getDevicesInRoom(homeId: string, roomId: string): Promise<SiriusDevice[]>;
  addDevice(homeId: string, roomId: string, name: string, ip?: string): Promise<SiriusDevice>;
  removeDevice(deviceId: string): Promise<void>;
  renameDevice(deviceId: string, newName: string): Promise<void>;
  moveDevice(deviceId: string, newRoomId: string, newHomeId: string): Promise<void>;
  getHomeStats(homeId: string): Promise<{ totalDevices: number, activeDevices: number | null }>;

  // Control
  setChannelState(deviceId: string, channelId: string, state: 'on' | 'off'): Promise<CommandResult>;
  getState(deviceId: string): Promise<SiriusDevice>;
}
