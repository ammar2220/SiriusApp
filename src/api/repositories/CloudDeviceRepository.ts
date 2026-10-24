import { supabase } from '../cloud/supabaseClient';
import { DeviceRepository } from '../deviceRepository';
import { Home, Room, SiriusDevice } from '../../types/home';
import {
  CloudHome,
  CloudRoom,
  CloudDevice,
  CloudChannel,
  CloudProfile
} from '../../types/cloud';
import persistentStorage from '../persistence/PersistentStorage';

const getEnrollmentGeneration = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;

const mapDeviceRow = (row: any, homeId: string): SiriusDevice => {
  const stateRow = Array.isArray(row.device_state) ? row.device_state[0] : row.device_state;
  const snapshot = stateRow?.state_json;
  const generation = getEnrollmentGeneration(row.enrollment_generation ?? stateRow?.enrollment_generation);
  const currentSnapshot = row.enrollment_status === 'ENROLLED' && generation !== undefined &&
    stateRow?.enrollment_generation === generation;
  const channels = Array.isArray(snapshot?.channels)
    ? snapshot.channels.map((channel: any) => ({
        id: `ch-${channel.index}`,
        index: channel.index,
        name: `Channel ${channel.index}`,
        state: channel.state,
        capabilities: ['switch'],
      }))
    : [];

  return {
    factoryId: row.factory_id,
    displayName: row.name,
    ipAddress: '',
    powerState: channels.some((channel: any) => channel.state === 'on') ? 'on' : channels.length ? 'off' : 'unknown',
    rssi: stateRow?.rssi ?? 0,
    connectionStatus: currentSnapshot ? (stateRow.connection_status === 'offline' ? 'offline' : 'online') : 'offline',
    firmwareVersion: 'unknown',
    roomId: row.room_id,
    homeId,
    type: 'relay',
    product: {
      code: row.product_code || 'SIRIUS_SWITCH_1CH',
      name: 'Sirius Switch',
      channelCount: row.channel_count,
      capabilities: ['switch'],
    },
    channels: currentSnapshot ? channels : [],
    lastSeen: currentSnapshot && stateRow?.last_seen ? new Date(stateRow.last_seen).getTime() : null,
    sessionId: currentSnapshot ? stateRow?.session_id : undefined,
    bootCount: currentSnapshot ? stateRow?.boot_count : undefined,
    revision: currentSnapshot ? stateRow?.revision : undefined,
    enrollmentGeneration: generation,
  };
};

export class CloudDeviceRepository implements DeviceRepository {

  private async cacheDevice(device: SiriusDevice): Promise<void> {
    const cache = await persistentStorage.loadState();
    const devices = new Map((cache.devices || []).map(item => [item.factoryId, item]));
    devices.set(device.factoryId, { ...(devices.get(device.factoryId) || {}), ...device } as any);
    await persistentStorage.saveState({ devices: [...devices.values()] as any });
  }

  async getProfile(): Promise<CloudProfile | null> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .single();

    if (error) {
      console.error('[CloudRepo] Error fetching profile:', error);
      return null;
    }
    return data;
  }

  async getHomes(): Promise<Home[]> {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user.id;

    if (!userId) return [];

    const { data, error } = await supabase
      .from('homes')
      .select('*, rooms(*)');

    if (error) {
      console.error('[CloudRepo] Error fetching homes:', error);
      const cached = await this.getCachedHomes(userId);
      if (cached.length) return cached;
      throw error;
    }

    const homes = (data || []).map(h => ({
      id: h.id,
      userId: h.owner_id,
      name: h.name,
      rooms: (h.rooms || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        homeId: h.id,
        devices: [],
      })),
    }));
    await persistentStorage.saveState({ homes: homes as any });
    return homes;
  }

  private async getCachedHomes(userId?: string): Promise<Home[]> {
    const cached = await persistentStorage.loadState();
    return (cached.homes || []).filter(home => !userId || home.userId === userId);
  }

  async getHomeStats(homeId: string): Promise<{ totalDevices: number, activeDevices: number | null }> {
    const { data, error } = await supabase
      .from('devices')
      .select('id, rooms!inner(home_id)')
      .eq('rooms.home_id', homeId);

    if (error) {
      console.error('[CloudRepo] Error fetching home stats:', error);
      const cache = await persistentStorage.loadState();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user.id || !(cache.homes || []).some(home => home.id === homeId && home.userId === session.user.id)) throw error;
      const devices = (cache.devices || []).filter(device => device.homeId === homeId);
      if (!devices.length) throw error;
      const active = devices.reduce((count, device) => count + (device.channels?.some(channel => channel.state === 'on') ? 1 : 0), 0);
      const unknown = devices.some(device => !device.channels?.length || device.channels.some(channel => channel.state === 'unknown'));
      return { totalDevices: devices.length, activeDevices: unknown ? null : active };
    }

    const devices = data || [];
    return {
      totalDevices: devices.length,
      activeDevices: null // Cloud state for activeDevices is unavailable/unknown in current schema
    };
  }

  async getHome(id: string, userId: string): Promise<Home> {
    const { data, error } = await supabase
      .from('homes')
      .select('*, rooms(*)')
      .eq('id', id)
      .single();

    if (error || !data) {
      const cached = (await this.getCachedHomes(userId)).find(home => home.id === id);
      if (cached) return cached;
      throw new Error(`Home ${id} not found or access denied.`);
    }

    const home: Home = {
      id: data.id,
      userId: data.owner_id,
      name: data.name,
      rooms: (data.rooms || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        homeId: data.id,
        devices: [],
      })),
    };
    const cachedHomes = await this.getCachedHomes(userId);
    await persistentStorage.saveState({ homes: [...cachedHomes.filter(item => item.id !== home.id), home] as any });
    return home;
  }

  async addHome(userId: string, name: string): Promise<Home> {
    const { data, error } = await supabase.rpc('create_home_with_owner', {
      p_name: name,
    });

    if (error) {
      console.error('[CloudRepo] addHome failed:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw error;
    }

    const homeId = Array.isArray(data) ? data[0]?.home_id : data?.home_id;
    if (!homeId) throw new Error('Home creation did not return an id');
    const { data: home, error: readError } = await supabase
      .from('homes')
      .select('*, rooms(*)')
      .eq('id', homeId)
      .single();
    if (readError || !home) throw readError || new Error('Created home could not be loaded');
    return {
      id: home.id,
      userId: home.owner_id,
      name: home.name,
      rooms: [],
    };
  }

  async renameHome(homeId: string, newName: string): Promise<void> {
    const { error } = await supabase
      .from('homes')
      .update({ name: newName })
      .eq('id', homeId);

    if (error) throw error;
  }

  async deleteHome(homeId: string): Promise<void> {
    const { error } = await supabase
      .from('homes')
      .delete()
      .eq('id', homeId);

    if (error) throw error;
  }

  async addRoom(homeId: string, name: string, type: string): Promise<Room> {
    const { data, error } = await supabase
      .from('rooms')
      .insert({ home_id: homeId, name, type })
      .select()
      .single();

    if (error) {
      console.error('[CloudRepo] addRoom failed:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });

      // If it's an RLS failure (403 or specific PG code), we provide a clearer error
      if (error.code === '42501') {
        throw new Error(`Permission denied adding room to home ${homeId}. Ensure you are the owner or a member of the home.`);
      }

      throw error;
    }

    return {
      id: data.id,
      name: data.name,
      type: data.type,
      homeId: data.home_id,
      devices: [],
    };
  }

  async renameRoom(homeId: string, roomId: string, newName: string): Promise<void> {
    const { error } = await supabase
      .from('rooms')
      .update({ name: newName })
      .eq('id', roomId);

    if (error) throw error;
  }

  async deleteRoom(homeId: string, roomId: string): Promise<void> {
    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', roomId);

    if (error) throw error;
  }

  async getDeviceIdByFactoryId(factoryId: string): Promise<string> {
    const { data, error } = await supabase
      .from('devices')
      .select('id')
      .eq('factory_id', factoryId)
      .single();

    if (error || !data) throw new Error(`Cloud ID not found for factory ID ${factoryId}`);
    return data.id;
  }

  async getDeviceByFactoryId(factoryId: string): Promise<SiriusDevice> {
    const { data, error } = await supabase
      .from('devices')
      .select('*, rooms(home_id), device_state(*)')
      .eq('factory_id', factoryId)
      .single();

    if (error || !data) {
      const cache = await persistentStorage.loadState();
      const { data: { session } } = await supabase.auth.getSession();
      const cached = (cache.devices || []).find(device => device.factoryId === factoryId);
      if (cached && session?.user.id && (cache.homes || []).some(home => home.id === cached.homeId && home.userId === session.user.id)) return cached as SiriusDevice;
      throw new Error(`Device with factory ID ${factoryId} not found in cloud.`);
    }

    const device = mapDeviceRow(data, data.rooms?.home_id || '');
    await this.cacheDevice(device);
    return device;
  }

  async getDevice(id: string): Promise<SiriusDevice> {
    const { data, error } = await supabase
      .from('devices')
      .select('*, rooms(home_id), device_state(*)')
      .eq('id', id)
      .single();

    if (error || !data) {
      const cache = await persistentStorage.loadState();
      const { data: { session } } = await supabase.auth.getSession();
      const cached = (cache.devices || []).find(device => device.factoryId === id || device.id === id);
      if (cached && session?.user.id && (cache.homes || []).some(home => home.id === cached.homeId && home.userId === session.user.id)) return cached as SiriusDevice;
      throw new Error(`Device ${id} not found in cloud.`);
    }

    const device = mapDeviceRow(data, data.rooms?.home_id || '');
    await this.cacheDevice(device);
    return device;
  }

  async getDevicesInRoom(homeId: string, roomId: string): Promise<SiriusDevice[]> {
    const { data, error } = await supabase
      .from('devices')
      .select('*, device_state(*)')
      .eq('room_id', roomId);

    if (error) {
      const cached = await persistentStorage.loadState();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user.id || !(cached.homes || []).some(home => home.id === homeId && home.userId === session.user.id)) {
        throw error;
      }
      const cachedDevices = (cached.devices || []).filter(device => device.roomId === roomId && device.homeId === homeId);
      if (cachedDevices.length) return cachedDevices as SiriusDevice[];
      throw error;
    }

    const devices = (data || []).map(d => mapDeviceRow(d, homeId));
    const cache = await persistentStorage.loadState();
    const byId = new Map((cache.devices || []).map(device => [device.factoryId, device]));
    for (const device of devices) byId.set(device.factoryId, device as any);
    await persistentStorage.saveState({ devices: [...byId.values()] as any });
    return devices;
  }

  async addDevice(
    homeId: string,
    roomId: string,
    name: string,
    factoryId: string,
    product?: SiriusDevice['product'],
  ): Promise<SiriusDevice> {
    const { data, error } = await supabase
      .from('devices')
      .insert({
        room_id: roomId,
        name,
        factory_id: factoryId,
        product_code: product?.code ?? null,
        product_type: product?.name ?? null,
        channel_count: product?.channelCount ?? 1,
      })
      .select()
      .single();

    if (error) throw error;

    const device = mapDeviceRow(data, homeId);

    // Preserve the ordinary provisioning journey. Remote activation is a
    // bounded compatibility bridge for the current shared-broker evaluation;
    // failure must not undo a locally usable newly provisioned device.
    try {
      const { data: activation, error: activationError } = await supabase.functions.invoke(
        'activate-legacy-remote-device',
        { body: { factoryId } },
      );
      if (activationError) throw activationError;
      if (activation?.enrollmentStatus === 'ENROLLED' && Number.isSafeInteger(activation.enrollmentGeneration)) {
        device.enrollmentGeneration = activation.enrollmentGeneration;
      }
    } catch (activationError) {
      console.warn('[CloudRepo] Remote activation is unavailable; local control remains available:', activationError);
    }

    await this.cacheDevice(device);
    return device;
  }

  async removeDevice(deviceId: string): Promise<void> {
    const { error } = await supabase
      .from('devices')
      .delete()
      .eq('id', deviceId);

    if (error) throw error;
  }

  async renameDevice(deviceId: string, newName: string): Promise<void> {
    const { error } = await supabase
      .from('devices')
      .update({ name: newName })
      .eq('id', deviceId);

    if (error) throw error;
  }

  async moveDevice(deviceId: string, newRoomId: string, newHomeId: string): Promise<void> {
    const { error } = await supabase
      .from('devices')
      .update({ room_id: newRoomId })
      .eq('id', deviceId);

    if (error) throw error;
  }

  async setChannelState(deviceId: string, channelId: string, state: 'on' | 'off'): Promise<import('../../types/device').CommandResult> {
    return {
      status: 'rejected',
      commandId: `cloud-err-${Date.now()}`,
      reason: 'CloudRepository does not handle physical device control. Use ControlRouter.',
    };
  }

  async getState(deviceId: string): Promise<SiriusDevice> {
    return this.getDevice(deviceId);
  }
}

export default new CloudDeviceRepository();
