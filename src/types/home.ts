import { DeviceModel, DeviceStateWire } from './device';

export type SiriusProductCode = 'SIRIUS_SWITCH_1CH' | 'SIRIUS_SWITCH_2CH' | 'SIRIUS_SWITCH_3CH';

export interface SiriusProduct {
  code: SiriusProductCode;
  name: string;
  channelCount: number;
  capabilities: string[];
}

export interface DeviceChannel {
  id: string;
  index: number;
  name: string;
  state: 'on' | 'off' | 'unknown';
  capabilities: string[];
}

export interface SiriusDevice extends DeviceModel {
  factoryId: string;
  displayName: string;
  ipAddress: string;
  // powerState is now derived from channels[0].state for backward compatibility
  powerState: 'on' | 'off' | 'unknown';
  rssi: number;
  connectionStatus: 'online' | 'offline' | 'connecting';
  firmwareVersion: string;
  lastSeen: number | null;
  roomId: string;
  homeId: string;
  product: SiriusProduct;
  channels: DeviceChannel[];
  type: 'relay' | 'ac' | 'sensor' | 'generic';
  // Realtime state
  sessionId?: string; // Random ID generated at boot to track session
  bootCount?: number; // Monotonic boot count from NVS
  revision?: number;   // Monotonic counter incremented on every state change
  enrollmentGeneration?: number; // Monotonic generation for re-enrollment safety
}

export interface Room {
  id: string;
  name: string;
  type: string;
  homeId: string;
  devices: string[]; // Array of Device IDs
}

export interface Home {
  id: string;
  userId: string;
  name: string;
  rooms: Room[];
}
