import { supabase } from '../cloud/supabaseClient';
import { Home, Room, SiriusDevice } from '../../types/home';
import CloudDeviceRepository from '../repositories/CloudDeviceRepository';
import persistentStorage from '../persistence/PersistentStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface MigrationResult {
  success: boolean;
  uploadedHomes: number;
  uploadedRooms: number;
  uploadedDevices: number;
  errors: string[];
}

export interface MigrationContract {
  idMap: {
    homes: Record<string, string>;
    rooms: Record<string, string>;
    devices: Record<string, string>;
  };
}

class MigrationService {
  private static MIGRATION_COMPLETED_KEY = '@sirius_migration_completed';

  async isMigrationCompleted(): Promise<boolean> {
    const val = await AsyncStorage.getItem(MigrationService.MIGRATION_COMPLETED_KEY);
    return val === 'true';
  }

  async performMigration(userId: string): Promise<MigrationResult> {
    console.log('[MigrationService] Starting local-to-cloud migration...');

    const result: MigrationResult = {
      success: false,
      uploadedHomes: 0,
      uploadedRooms: 0,
      uploadedDevices: 0,
      errors: [],
    };

    try {
      // 1. Check if cloud already has homes
      const cloudHomes = await CloudDeviceRepository.getHomes();
      if (cloudHomes.length > 0) {
        console.log('[MigrationService] Cloud hierarchy already exists. Skipping migration.');
        result.success = true;
        return result;
      }

      // 2. Load legacy local state directly from PersistentStorage
      const appState = await persistentStorage.loadState();
      const localHomes = (appState.homes || []).filter((h: any) => h.userId === userId);

      if (localHomes.length === 0) {
        console.log('[MigrationService] No local homes found to migrate.');
        result.success = true;
        return result;
      }

      const idMap: MigrationContract['idMap'] = {
        homes: {},
        rooms: {},
        devices: {},
      };

      // 3. Migrate Homes
      for (const localHome of localHomes) {
        const { data: cloudHome, error: homeError } = await supabase
          .from('homes')
          .insert({ owner_id: userId, name: localHome.name })
          .select()
          .single();

        if (homeError) {
          result.errors.push(`Home ${localHome.name} error: ${homeError.message}`);
          continue;
        }

        idMap.homes[localHome.id] = cloudHome.id;
        result.uploadedHomes++;
      }

      // 4. Migrate Rooms
      for (const localHome of localHomes) {
        const cloudHomeId = idMap.homes[localHome.id];
        if (!cloudHomeId) continue;

        for (const localRoom of localHome.rooms) {
          const { data: cloudRoom, error: roomError } = await supabase
            .from('rooms')
            .insert({ home_id: cloudHomeId, name: localRoom.name, type: localRoom.type })
            .select()
            .single();

          if (roomError) {
            result.errors.push(`Room ${localRoom.name} error: ${roomError.message}`);
            continue;
          }

          idMap.rooms[localRoom.id] = cloudRoom.id;
          result.uploadedRooms++;
        }
      }

      // 5. Migrate Devices
      const localDevices = appState.devices || [];
      const physicalDevicesRegistry = appState.physicalDevices || {};

      for (const localDevice of localDevices) {
        // ONLY migrate devices that are verified physical devices.
        // A device is verified if its factoryId exists in the known physical-device registry.
        if (!localDevice.factoryId || !physicalDevicesRegistry[localDevice.factoryId]) {
          console.warn(`[MigrationService] Skipping unverified or synthetic device: ${localDevice.factoryId}`);
          continue;
        }

        const deviceHomeId = localDevice.homeId;
        if (!idMap.homes[deviceHomeId]) continue;

        const cloudHomeId = idMap.homes[deviceHomeId];
        const cloudRoomId = idMap.rooms[localDevice.roomId];

        if (!cloudRoomId) {
          // Fallback: if room migration failed, we can't link the device correctly
          // unless we create a default room. For now, we skip.
          continue;
        }

        const { error: devError } = await supabase
          .from('devices')
          .insert({
            factory_id: localDevice.factoryId,
            name: localDevice.displayName,
            room_id: cloudRoomId,
            product_code: localDevice.product?.code || 'SIRIUS_SWITCH_1CH',
            channel_count: localDevice.product?.channelCount || 1,
          });

        if (devError) {
          result.errors.push(`Device ${localDevice.factoryId} error: ${devError.message}`);
          continue;
        }
        result.uploadedDevices++;
      }

      result.success = result.errors.length === 0 || result.uploadedHomes > 0;

      if (result.success) {
        await AsyncStorage.setItem(MigrationService.MIGRATION_COMPLETED_KEY, 'true');
      }

    } catch (e: any) {
      console.error('[MigrationService] Fatal migration error:', e);
      result.errors.push(e.message);
      result.success = false;
    }

    return result;
  }
}

export default new MigrationService();
