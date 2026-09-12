import AsyncStorage from '@react-native-async-storage/async-storage';
import { SiriusProduct, DeviceChannel } from '../../types/home';

export interface AppState {
  schemaVersion: number;
  homes: HomeData[];
  devices: DeviceData[];
  physicalDevices: Record<string, any>;
}

interface HomeData {
  id: string;
  userId: string;
  name: string;
  rooms: RoomData[];
}

interface RoomData {
  id: string;
  name: string;
  type: string;
  homeId: string;
  devices: string[];
}

interface DeviceData {
  id: string;
  factoryId: string;
  displayName: string;
  ipAddress: string;
  powerState: 'on' | 'off' | 'unknown';
  rssi: number;
  connectionStatus: 'online' | 'offline' | 'connecting';
  firmwareVersion: string;
  roomId: string;
  homeId: string;
  type: 'relay' | 'ac' | 'sensor' | 'generic';
  product: SiriusProduct;
  channels: DeviceChannel[];
}

const STORAGE_KEY = '@sirius_app_state';
const CURRENT_SCHEMA_VERSION = 3;
const LEGACY_LOCAL_USER_ID = 'user_legacy_v1';

class PersistentStorage {
  async saveState(state: Partial<AppState>): Promise<void> {
    try {
      const current = await this.loadState();
      const updated = {
        ...current,
        ...state,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('PersistentStorage: Error saving state', e);
      throw e;
    }
  }

  async loadState(): Promise<AppState> {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (!json) return this.getDefaultState();

      const parsed = JSON.parse(json);

      if (!parsed.schemaVersion || parsed.schemaVersion < CURRENT_SCHEMA_VERSION) {
        return this.migrate(parsed);
      }

      return parsed;
    } catch (e) {
      console.error('PersistentStorage: Error loading state', e);
      return this.getDefaultState();
    }
  }

  private migrate(oldState: any): AppState {
    console.log('PersistentStorage: Migrating state...');

    let state = { ...oldState };

    // Migration v1 -> v2
    if (!state.schemaVersion || state.schemaVersion < 2) {
      console.log('PersistentStorage: Migrating v1 -> v2...');
      const userId = LEGACY_LOCAL_USER_ID;
      const migratedHomes: HomeData[] = [];
      const migratedDevices: DeviceData[] = [];

      if (state.homes) {
        state.homes.forEach((home: any) => {
          migratedHomes.push({
            ...home,
            userId: userId,
            rooms: (home.rooms || []).map((room: any) => ({
              ...room,
              homeId: home.id,
            })),
          });
        });
      }

      if (state.devices) {
        state.devices.forEach((device: any) => {
          const home = (state.homes || []).find((h: any) =>
            h.rooms.some((r: any) => r.id === device.roomId)
          );
          migratedDevices.push({
            ...device,
            homeId: home ? home.id : (state.homes?.[0]?.id || 'home-default'),
            id: device.id || device.factoryId,
          });
        });
      }

      state.homes = migratedHomes;
      state.devices = migratedDevices;
      state.schemaVersion = 2;
    }

    // Migration v2 -> v3 (Multi-channel / Product Model)
    if (state.schemaVersion < 3) {
      console.log('PersistentStorage: Migrating v2 -> v3...');

      const productDefaults: Record<string, SiriusProduct> = {
        'SIRIUS_SWITCH_1CH': { code: 'SIRIUS_SWITCH_1CH', name: 'Sirius 1-Channel Switch', channelCount: 1, capabilities: ['switch'] },
        'SIRIUS_SWITCH_2CH': { code: 'SIRIUS_SWITCH_2CH', name: 'Sirius 2-Channel Switch', channelCount: 2, capabilities: ['switch'] },
        'SIRIUS_SWITCH_3CH': { code: 'SIRIUS_SWITCH_3CH', name: 'Sirius 3-Channel Switch', channelCount: 3, capabilities: ['switch'] },
      };
      const defaultProduct = productDefaults['SIRIUS_SWITCH_1CH'];

      if (state.devices) {
        state.devices = state.devices.map((device: any) => {
          const product = defaultProduct;
          const channels: DeviceChannel[] = [];

          for (let i = 1; i <= product.channelCount; i++) {
            channels.push({
              id: `channel-${i}`,
              index: i,
              name: `Channel ${i}`,
              state: i === 1 ? (device.powerState || 'unknown') : 'unknown',
              capabilities: product.capabilities,
            });
          }

          return {
            ...device,
            product: product,
            channels: channels,
          };
        });
      }
      state.schemaVersion = 3;
    }

    return state as AppState;
  }

  private getDefaultState(): AppState {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      homes: [],
      devices: [],
      physicalDevices: {},
    };
  }

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }
}

export default new PersistentStorage();
