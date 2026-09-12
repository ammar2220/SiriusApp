import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AppState {
  schemaVersion: number;
  homes: any[];
  devices: any[];
  physicalDevices: Record<string, any>;
}

const STORAGE_KEY = '@sirius_app_state';
const CURRENT_SCHEMA_VERSION = 1;

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
    // Future migration logic goes here
    return {
      ...oldState,
      schemaVersion: CURRENT_SCHEMA_VERSION,
    };
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
