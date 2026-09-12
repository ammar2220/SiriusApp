export interface DeviceInfo {
  id: string;
  ver: string;
}

export interface DeviceState {
  power: 'on' | 'off';
  rssi: number;
}

export interface DeviceModel {
  factoryId: string;
  displayName: string;
  ipAddress: string;
  powerState: 'on' | 'off' | 'unknown';
  rssi: number;
  connectionStatus: 'online' | 'offline' | 'connecting';
  firmwareVersion: string;
}
