import { DeviceModel } from './device';

export interface DeviceChannel {
  id: string;
  name: string;
  powerState: 'on' | 'off' | 'unknown';
}

export interface SiriusDevice extends DeviceModel {
  roomId: string;
  channels: DeviceChannel[];
  type: 'relay' | 'ac' | 'sensor' | 'generic';
}

export interface Room {
  id: string;
  name: string;
  type: string;
  devices: string[]; // Array of Device IDs
}

export interface Home {
  id: string;
  name: string;
  rooms: Room[];
}
