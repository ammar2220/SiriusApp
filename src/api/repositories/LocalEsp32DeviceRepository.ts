import { DeviceRepository } from '../deviceRepository';
import { SiriusDevice, Home, Room } from '../../types/home';
import apiClient from '../local/apiClient';
import persistentStorage from '../persistence/PersistentStorage';
import { NativeModules } from 'react-native';
import LocalRealtimeService, { LocalRealtimeEvent } from '../realtime/LocalRealtimeService';
import { AppState } from 'react-native';
import { v4 as uuidv4 } from 'uuid';

const { DeviceDiscoveryModule } = NativeModules;

class SchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaError';
  }
}

class PreDispatchConnectionError extends Error {
  constructor(message: string = 'connection_failed') {
    super(message);
    this.name = 'PreDispatchConnectionError';
  }
}

class LocalEsp32DeviceRepository implements DeviceRepository {
  // Stores real physical devices discovered/provisioned
  // Key: factoryId, Value: device config
  private deviceMap: Record<string, { ip: string, name: string, lastSeen?: number }> = {};
  private deviceCache: Record<string, SiriusDevice> = {};
  private realtimeListeners: Array<(device: SiriusDevice) => void> = [];

  // Tracks the latest request sequence per device to prevent out-of-order HTTP responses
  private requestSequences: Record<string, number> = {};
  // Tracks how many requests are currently in flight per device
  private pendingRequests: Record<string, number> = {};

  async init(): Promise<void> {
    try {
      const state = await persistentStorage.loadState();
      if (state.physicalDevices && Object.keys(state.physicalDevices).length > 0) {
        console.log(`[LocalRepo] Initializing with ${Object.keys(state.physicalDevices).length} physical devices.`);
        for (const [id, config] of Object.entries(state.physicalDevices)) {
          console.log(`[LocalRepo] Registered: ${id} @ ${config.ip}`);
        }
        this.deviceMap = state.physicalDevices;
      }

      // Initialize Realtime Listener
      LocalRealtimeService.subscribe((event: LocalRealtimeEvent) => {
        this.handleRealtimeEvent(event);
      });

      // STARTUP CONNECTION: Establish connections for all known devices immediately
      for (const [factoryId, config] of Object.entries(this.deviceMap)) {
        LocalRealtimeService.connect(factoryId, config.ip, async (baseline) => {
          // This is a fallback; the service also emits the baseline to all listeners
          await this.handleRealtimeEvent(baseline);
        });
      }

      // AppState handling for WebSocket lifecycle
      AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          // Re-establish connections for all managed devices
          for (const [factoryId, config] of Object.entries(this.deviceMap)) {
            LocalRealtimeService.connect(factoryId, config.ip, async (baseline) => {
              this.handleRealtimeEvent(baseline);
            });
          }
        } else if (nextAppState.match(/inactive|background/)) {
          // Stop realtime to save battery
          for (const factoryId of Object.keys(this.deviceMap)) {
            LocalRealtimeService.disconnect(factoryId);
          }
        }
      });

    } catch (e) {
      console.error('LocalEsp32DeviceRepository: Init failed', e);
    }
  }

  private async handleRealtimeEvent(event: LocalRealtimeEvent) {
    if (event.type === 'reconciliation_failure') {
      console.log(`[Realtime] Reconciliation failure for ${event.deviceId}: ${event.error}`);
      // Trigger a standard getDevice call to resolve the final state (Online or Offline)
      // This avoids duplicating logic and ensures a terminal state is reached.
      this.getDevice(event.deviceId).catch(e =>
        console.error(`[Realtime] Recovery fetch after reconciliation failure failed for ${event.deviceId}:`, e)
      );
      return;
    }

    if (event.type !== 'state_update') return;
    const { deviceId, revision, sessionId, bootCount, enrollmentGeneration, state } = event;
    const config = this.deviceMap[deviceId];
    if (!config) return;

    const currentDevice = this.deviceCache[deviceId];

    // 1. Handle Session Change: If we see a session ID different from our cache,
    // or a boot count change, it means the device rebooted or our session expired.
    if (!currentDevice ||
        sessionId !== currentDevice.sessionId ||
        bootCount !== currentDevice.bootCount ||
        enrollmentGeneration !== currentDevice.enrollmentGeneration) {
      console.log(`[Realtime] Session or Boot mismatch for ${deviceId}. Reconciling baseline...`);
      try {
        // Fetch the absolute truth from the device
        const baseline = await this.getDevice(deviceId);

        // Update cache with the baseline session and revision
        this.deviceCache[deviceId] = baseline;

        // Only apply the triggering event if it is actually newer than the baseline
        // and matches the new session ID and boot count.
        if (
          baseline.sessionId !== undefined &&
          baseline.bootCount !== undefined &&
          baseline.enrollmentGeneration !== undefined &&
          baseline.revision !== undefined &&
          sessionId === baseline.sessionId &&
          event.bootCount === baseline.bootCount &&
          enrollmentGeneration === baseline.enrollmentGeneration &&
          revision > baseline.revision
        ) {
          console.log(`[Realtime] Event is newer than baseline and matches new session. Applying update.`);
          await this.applyUpdate(event);
        } else {
          console.log(`[Realtime] Event is stale relative to baseline or from old session. Dropping.`);
        }
        return; // Exit to prevent double-application via the logic below
      } catch (e) {
        console.error(`[Realtime] Baseline reconciliation failed for ${deviceId}:`, e);
        return;
      }
    } else if (revision <= (currentDevice.revision || 0)) {
      // 2. Same session: Ignore stale or duplicate events
      console.log(`[Realtime] Ignored stale/duplicate event for ${deviceId} (Rev ${revision} <= ${currentDevice.revision})`);
      return;
    }

    // 3. Authoritative update within the same session
    if (event.type === 'state_update') {
      await this.applyUpdate(event);
    }
  }

  private async applyUpdate(event: LocalRealtimeEvent) {
    if (event.type !== 'state_update') return;
    const { deviceId, revision, sessionId, bootCount, enrollmentGeneration, state } = event;
    const currentDevice = this.deviceCache[deviceId];
    if (!currentDevice) return;

    console.log(`[Realtime] Applying update for ${deviceId}: Rev ${revision}`);

    const updatedDevice = {
      ...currentDevice,
      bootCount,
      enrollmentGeneration,
      revision,
      sessionId,
      channels: state.channels.map((ch: any) => ({
        id: `ch-${ch.index}`,
        index: ch.index,
        name: currentDevice.channels[ch.index - 1]?.name || `Channel ${ch.index}`,
        state: ch.state,
        capabilities: ['switch'],
      })),
      lastSeen: Date.now(),
    };

    this.deviceCache[deviceId] = updatedDevice;
    await this.persistDeviceCache();
    this.realtimeListeners.forEach(l => l(updatedDevice));
  }

  // Method for UI to subscribe to instant updates
  onDeviceUpdate(callback: (device: SiriusDevice) => void) {
    this.realtimeListeners.push(callback);
    return () => {
      this.realtimeListeners = this.realtimeListeners.filter(l => l !== callback);
    };
  }

  // Synchronous access to the registered device map for initial status seeding
  getPhysicalDevicesSync(): Record<string, { ip: string, name: string, lastSeen?: number }> {
    return { ...this.deviceMap };
  }

  async save() {
    await persistentStorage.saveState({
      physicalDevices: this.deviceMap,
    });
  }

  private async persistDeviceCache() {
    const state = await persistentStorage.loadState();
    const merged = new Map((state.devices || []).map(device => [device.factoryId, device]));
    for (const device of Object.values(this.deviceCache)) {
      const previous = merged.get(device.factoryId);
      merged.set(device.factoryId, {
        ...previous,
        ...device,
        displayName: device.displayName || previous?.displayName || '',
        homeId: device.homeId || previous?.homeId || '',
        roomId: device.roomId || previous?.roomId || '',
        enrollmentGeneration: device.enrollmentGeneration ?? previous?.enrollmentGeneration,
      } as any);
    }
    await persistentStorage.saveState({
      physicalDevices: this.deviceMap,
      devices: [...merged.values()] as any,
    });
  }

  private async _fetchDeviceData(ip: string): Promise<SiriusDevice> {
    const start = Date.now();

    const infoStart = Date.now();
    const info = await apiClient.getInfo(ip);
    const infoDuration = Date.now() - infoStart;

    const stateStart = Date.now();
    const state = await apiClient.getState(ip);
    const stateDuration = Date.now() - stateStart;

    // DIAGNOSTIC: Boundary check
    console.log(`[LocalRepo-HTTP] GET /api/state ${ip} -> Type: ${typeof state}, Keys: ${state ? Object.keys(state).join(',') : 'none'}, ChannelsType: ${state?.channels ? typeof state.channels : 'missing'}, Count: ${state?.channels?.length ?? 'N/A'}`);

    // STRICT CONTRACT VALIDATION
    if (!state || typeof state !== 'object') {
      throw new SchemaError(`Invalid state payload: expected object, got ${typeof state}`);
    }
    if (!Array.isArray(state.channels) || state.channels.length === 0) {
      throw new SchemaError(`Invalid state payload: channels must be a non-empty array`);
    }
    if (typeof state.sessionId !== 'string' || state.sessionId.trim() === '') {
      throw new SchemaError(`Invalid state payload: sessionId must be a non-empty string`);
    }
    if (typeof state.revision !== 'number' || !Number.isFinite(state.revision) || state.revision < 0) {
      throw new SchemaError(`Invalid state payload: revision must be a non-negative number`);
    }
    if (typeof state.bootCount !== 'number' || !Number.isInteger(state.bootCount) || state.bootCount < 0) {
      throw new SchemaError(`Invalid state payload: bootCount must be a non-negative integer`);
    }
    if (typeof state.enrollmentGeneration !== 'number' ||
        !Number.isSafeInteger(state.enrollmentGeneration) || state.enrollmentGeneration < 1) {
      throw new SchemaError(`Invalid state payload: enrollmentGeneration must be a positive integer`);
    }

    const seenIndices = new Set();
    for (const ch of state.channels) {
      if (!ch || typeof ch !== 'object') throw new SchemaError(`Invalid channel entry: expected object`);
      if (!Number.isInteger(ch.index) || ch.index <= 0 || ch.index > 8) throw new SchemaError(`Invalid channel index: ${ch.index}. Must be integer 1-8`);
      if (ch.state !== 'on' && ch.state !== 'off') throw new SchemaError(`Invalid channel state: ${ch.state}`);
      if (seenIndices.has(ch.index)) throw new SchemaError(`Duplicate channel index: ${ch.index}`);
      seenIndices.add(ch.index);
    }

    if (state.channels.length > 8) {
      throw new SchemaError(`Invalid channel count: ${state.channels.length}. Maximum supported is 8`);
    }

    const totalDuration = Date.now() - start;
    console.log(`[LocalRepo] _fetchDeviceData for ${ip} took ${totalDuration}ms (info: ${infoDuration}ms, state: ${stateDuration}ms)`);

    const channelCount = state.channels.length;
    const channelNames = ['Main', 'Secondary', 'Auxiliary'];

    const mappedChannels = state.channels.map((ch, idx) => ({
      id: `ch-${ch.index}`,
      index: ch.index,
      name: channelNames[idx] || `Channel ${idx + 1}`,
      state: ch.state,
      capabilities: ['switch'],
    }));

    const powerState = mappedChannels.some(c => c.state === 'on') ? 'on' :
                       mappedChannels.every(c => c.state === 'off') ? 'off' : 'unknown';

    const productCode = channelCount === 1 ? 'SIRIUS_SWITCH_1CH' :
                        channelCount === 2 ? 'SIRIUS_SWITCH_2CH' :
                        channelCount === 3 ? 'SIRIUS_SWITCH_3CH' : 'SIRIUS_SWITCH_1CH';

    const productNames: Record<string, string> = {
      'SIRIUS_SWITCH_1CH': 'Sirius 1-Channel Switch',
      'SIRIUS_SWITCH_2CH': 'Sirius 2-Channel Switch',
      'SIRIUS_SWITCH_3CH': 'Sirius 3-Channel Switch',
    };

    // Update persisted last seen timestamp
    if (this.deviceMap[info.id]) {
      this.deviceMap[info.id].lastSeen = Date.now();
      await this.save();
    }

    return {
      factoryId: info.id,
      displayName: '', // Will be filled by the caller using deviceMap
      ipAddress: ip,
      powerState,
      rssi: state.rssi,
      connectionStatus: 'online',
      firmwareVersion: info.ver,
      lastSeen: Date.now(),
      roomId: '', // Will be filled by the caller
      homeId: '', // Will be filled by the caller
      type: 'relay',
      product: {
        code: productCode,
        name: productNames[productCode] || 'Sirius Switch',
        channelCount: channelCount,
        capabilities: ['switch'],
      },
      channels: mappedChannels,
      bootCount: state.bootCount,
      revision: state.revision,
      sessionId: state.sessionId,
      enrollmentGeneration: state.enrollmentGeneration,
    };
  }

  private async recoverDeviceIp(deviceId: string): Promise<string | null> {
    console.log(`[DeviceRecovery] Starting mDNS discovery for device: ${deviceId}`);
    try {
      const discoveryResult = await Promise.race([
        DeviceDiscoveryModule.discoverDevice('_http._tcp'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('mDNS discovery timed out')), 5000)
        )
      ]);

      const host = `${discoveryResult.host}:${discoveryResult.port}`;
      console.log(`[DeviceRecovery] Candidate discovered at ${host}, verifying identity...`);

      const info = await apiClient.getInfo(host);
      if (info.id === deviceId) {
        console.log(`[DeviceRecovery] Factory ID matched: ${info.id}. Updating cached IP.`);
        this.deviceMap[deviceId].ip = host;
        await this.save();
        return host;
      } else {
        console.log(`[DeviceRecovery] Factory ID mismatch. Expected ${deviceId}, got ${info.id}. Ignoring candidate.`);
      }
    } catch (e: any) {
      console.log(`[DeviceRecovery] Recovery failed: ${e.message}`);
    }
    return null;
  }

  private async executeWithRecovery<T>(deviceId: string, operation: (ip: string) => Promise<T>): Promise<T> {
    const config = this.deviceMap[deviceId];
    if (!config) throw new Error('Device not found');

    const start = Date.now();
    try {
      return await operation(config.ip);
    } catch (e: any) {
      if (e instanceof SchemaError) {
        console.log(`[DeviceRecovery] Schema error for ${deviceId}: ${e.message}. Bypassing mDNS recovery.`);
        throw e;
      }

      const elapsed = Date.now() - start;
      console.log(`[DeviceRecovery] Request failed after ${elapsed}ms: ${e.message}`);

      const newIp = await this.recoverDeviceIp(deviceId);
      if (newIp) {
        console.log(`[DeviceRecovery] Retrying original request with recovered IP: ${newIp}`);
        return await operation(newIp);
      }

      console.log(`[DeviceRecovery] Recovery unsuccessful. Returning original error.`);
      throw e;
    }
  }

  async addHome(name: string): Promise<Home> {
    throw new Error('Adding homes is not supported for local devices');
  }

  async addRoom(homeId: string, name: string, type: string): Promise<Room> {
    throw new Error('Adding rooms is not supported for local devices');
  }

  async getHomes(userId: string): Promise<Home[]> {
    return [];
  }

  async renameHome(homeId: string, newName: string): Promise<void> {
    throw new Error('Home management is handled by the primary repository');
  }

  async deleteHome(homeId: string): Promise<void> {
    throw new Error('Home management is handled by the primary repository');
  }

  async renameRoom(homeId: string, roomId: string, newName: string): Promise<void> {
    throw new Error('Room management is handled by the primary repository');
  }

  async getHomeStats(homeId: string): Promise<{ totalDevices: number, activeDevices: number }> {
    return { totalDevices: 0, activeDevices: 0 };
  }

  async getHome(id: string): Promise<Home> {
    throw new Error('Home management is handled by the primary repository');
  }

  private async transitionToOffline(id: string): Promise<SiriusDevice> {
    const cached = this.deviceCache[id];
    const config = this.deviceMap[id];

    const offlineDevice: SiriusDevice = {
      factoryId: id,
      displayName: config?.name || 'Unknown Device',
      ipAddress: config?.ip || 'unknown',
      powerState: cached?.powerState || 'unknown',
      rssi: cached?.rssi || 0,
      connectionStatus: 'offline',
      firmwareVersion: cached?.firmwareVersion || 'unknown',
      roomId: cached?.roomId || '',
      homeId: cached?.homeId || '',
      type: 'relay',
      product: cached?.product || {
        code: 'SIRIUS_SWITCH_1CH',
        name: 'Sirius 1-Channel Switch',
        channelCount: 1,
        capabilities: ['switch'],
      },
      channels: cached?.channels || [{ id: 'ch-1', index: 1, name: 'Main', state: 'unknown', capabilities: ['switch'] }],
      lastSeen: cached?.lastSeen || null,
      bootCount: cached?.bootCount || 0,
      revision: cached?.revision || 0,
      sessionId: cached?.sessionId || 'offline',
    };

    if (!cached || cached.connectionStatus !== 'offline') {
      console.log(`[LocalRepo-Trace] Transitioning ${id} to OFFLINE. Notifying ${this.realtimeListeners.length} listeners`);
      this.deviceCache[id] = offlineDevice;
      this.realtimeListeners.forEach(l => l(offlineDevice));
    }
    return offlineDevice;
  }

  async getDevice(id: string, caller = 'unknown'): Promise<SiriusDevice> {
    const start = Date.now();

    const config = this.deviceMap[id];
    console.log(`[LocalRepo-Trace] getDevice START: id=${id}, caller=${caller}, inMap=${!!config}, pending=${this.pendingRequests[id] ?? 0}`);
    if (config) {
      const cached = this.deviceCache[id];
      const connectingDevice: SiriusDevice = {
        factoryId: id,
        displayName: config.name,
        ipAddress: config.ip,
        powerState: cached?.powerState || 'unknown',
        rssi: cached?.rssi || 0,
        connectionStatus: (cached?.connectionStatus === 'online') ? 'online' : 'connecting',
        firmwareVersion: cached?.firmwareVersion || 'unknown',
        roomId: cached?.roomId || '',
        homeId: cached?.homeId || '',
        type: 'relay',
        product: cached?.product || {
          code: 'SIRIUS_SWITCH_1CH',
          name: 'Sirius Switch',
          channelCount: 1,
          capabilities: ['switch'],
        },
        channels: cached?.channels || [],
        lastSeen: cached?.lastSeen || null,
        bootCount: cached?.bootCount || 0,
        revision: cached?.revision || 0,
        sessionId: cached?.sessionId || '',
      };

      this.deviceCache[id] = connectingDevice;
      this.realtimeListeners.forEach(l => l(connectingDevice));
    }

    const mySeq = (this.requestSequences[id] ?? 0) + 1;
    this.requestSequences[id] = mySeq;
    this.pendingRequests[id] = (this.pendingRequests[id] ?? 0) + 1;

    try {
      return await this.executeWithRecovery(id, async (ip) => {
        const data = await this._fetchDeviceData(ip);

        if (mySeq < (this.requestSequences[id] ?? 0)) {
          const elapsed = Date.now() - start;
          console.log(`[LocalRepo-Trace] Superseded response: id=${id}, seq=${mySeq}, currentSeq=${this.requestSequences[id]}, elapsed=${elapsed}ms`);
          const cached = this.deviceCache[id];
          if (cached && cached.connectionStatus !== 'connecting') return cached;

          if (cached && (this.pendingRequests[id] ?? 0) > 1) return cached;

          return this.transitionToOffline(id);
        }

        const device = {
          ...data,
          displayName: this.deviceMap[id]?.name || '',
          enrollmentGeneration: data.enrollmentGeneration,
        };
        const cached = this.deviceCache[id];
        if (cached) {
          if (device.sessionId === cached.sessionId) {
            if ((device.revision ?? 0) < (cached.revision ?? 0)) {
              console.log(`[LocalRepo-Trace] Stale HTTP: id=${id}, rev=${device.revision}, cachedRev=${cached.revision}`);
              device.revision = cached.revision;
              device.sessionId = cached.sessionId;
              device.channels = cached.channels;
            }
          } else {
            this.deviceCache[id] = device;
            await this.persistDeviceCache();
            this.realtimeListeners.forEach(l => l(device));
            console.log(`[LocalRepo-Trace] New session resolved: id=${id}, session=${device.sessionId}, duration=${Date.now() - start}ms`);
            return device;
          }
        }

        this.deviceCache[id] = device;
        await this.persistDeviceCache();
        this.realtimeListeners.forEach(l => l(device));
        console.log(`[LocalRepo-Trace] Full resolution: id=${id}, status=${device.connectionStatus}, duration=${Date.now() - start}ms`);
        return device;
      }).catch(async (e) => {
        const elapsed = Date.now() - start;
        console.log(`[LocalRepo-Trace] getDevice failed: id=${id}, error=${e.message}, elapsed=${elapsed}ms`);

        if (mySeq < (this.requestSequences[id] ?? 0)) {
          console.log(`[LocalRepo-Trace] Ignoring superseded failure: id=${id}, seq=${mySeq}`);
          const cached = this.deviceCache[id];
          if (cached && cached.connectionStatus !== 'connecting') return cached;

          if (cached && (this.pendingRequests[id] ?? 0) > 1) return cached;

          return this.transitionToOffline(id);
        }

        return this.transitionToOffline(id);
      });
    } finally {
      this.pendingRequests[id] = Math.max(0, (this.pendingRequests[id] ?? 0) - 1);
    }
  }

  async getDevicesInRoom(homeId: string, roomId: string): Promise<SiriusDevice[]> {
    return []; // Now handled by CompositeDeviceRepository via the authoritative hierarchy
  }

  async addDevice(homeId: string, roomId: string, name: string, ip?: string): Promise<SiriusDevice> {
    if (!ip) {
      throw new Error('Physical device IP is required for provisioning. Please ensure the device is discovered on the network.');
    }
    const deviceIp = ip;

    try {
      const info = await apiClient.getInfo(deviceIp);
      const factoryId = info.id;

      this.deviceMap[factoryId] = {
        ip: deviceIp,
        name,
      };

      // Establish realtime connection immediately for the newly added device
      LocalRealtimeService.connect(factoryId, deviceIp, async (baseline) => {
        await this.handleRealtimeEvent(baseline);
      });

      return this.getDevice(factoryId);
    } catch (e: any) {
      throw new Error(`Failed to verify physical device at ${deviceIp}: ${e.message}`);
    }
  }

  async removeDevice(deviceId: string): Promise<void> {
    if (!this.deviceMap[deviceId]) {
      throw new Error('Device not found');
    }
    delete this.deviceMap[deviceId];
    await this.save();
  }

  async resetDevice(deviceId: string): Promise<{ success: boolean }> {
    const config = this.deviceMap[deviceId];
    if (!config) {
      throw new Error('Device not found');
    }

    try {
      const result = await apiClient.resetProvisioning(config.ip);
      if (result.status === 'resetting') {
        return { success: true };
      }
      throw new Error(`Unexpected reset status: ${result.status}`);
    } catch (e: any) {
      console.error(`[LocalRepo] Remote reset failed for ${deviceId}: ${e.message}`);
      throw new Error(`Unable to reset the device: ${e.message}`);
    }
  }

  async renameDevice(deviceId: string, newName: string): Promise<void> {
    if (!this.deviceMap[deviceId]) {
      throw new Error('Device not found');
    }
    if (!newName || newName.trim().length === 0) {
      throw new Error('Device name cannot be empty');
    }
    this.deviceMap[deviceId].name = newName.trim();
    await this.save();
  }

  async moveDevice(deviceId: string, newRoomId: string, newHomeId: string): Promise<void> {
    // Hierarchy movement is authoritative in the Cloud repository.
    // Local repository does not manage room/home assignment.
  }

  async setChannelState(deviceId: string, channelId: string, state: 'on' | 'off'): Promise<import('../../types/device').CommandResult> {
    // This method is now a wrapper for executeCommand to maintain backward compatibility
    // during the transition to the Unified Control Architecture.
    try {
      const device = this.deviceCache[deviceId];
      if (
        !device ||
        device.sessionId === undefined || device.sessionId === 'offline' ||
        device.bootCount === undefined || device.bootCount <= 0 ||
        device.revision === undefined || device.revision < 0 ||
        device.enrollmentGeneration === undefined ||
        !Number.isSafeInteger(device.enrollmentGeneration) || device.enrollmentGeneration <= 0
      ) {
        throw new Error('Device identity unknown or offline; cannot construct safety fence parameters');
      }

      const command: import('../../types/device').SiriusCommand = {
        commandId: uuidv4(),
        deviceId,
        enrollmentGeneration: device.enrollmentGeneration,
        expectedSessionId: device.sessionId,
        expectedRevision: device.revision,
        expectedBootCount: device.bootCount,
        expiresAt: Date.now() + 30000, // 30s TTL
        target: {
          channel: parseInt(channelId.replace('ch-', ''), 10) || 1,
          action: 'SET_STATE',
          value: state,
        },
        source: 'LOCAL_APP',
        timestamp: Date.now(),
      };

      return await this.executeCommand(command);
    } catch (e: any) {
      return {
        status: 'rejected',
        commandId: `err-${deviceId}-${Date.now()}`,
        reason: e.message || 'Local control failed',
      };
    }
  }

  /**
   * Executes a unified SiriusCommand and returns the authoritative result.
   */
  async executeCommand(command: import('../../types/device').SiriusCommand): Promise<import('../../types/device').CommandResult> {
    try {
      return await this.executeWithRecovery(command.deviceId, async (ip) => {
        const result = await apiClient.sendCommand(ip, command);
        if (result.status === 'connection_failed') {
          throw new PreDispatchConnectionError();
        }
        return result;
      });
    } catch (e: any) {
      if (e instanceof PreDispatchConnectionError) {
        return {
          status: 'connection_failed',
          commandId: command.commandId,
          reason: e.message || 'Proven pre-dispatch connection failure after mDNS recovery',
        };
      }
      // For other errors (SchemaError, etc.), return rejected
      return {
        status: 'rejected',
        commandId: command.commandId,
        reason: e.message || 'Local execute failed',
      };
    }
  }

  async getState(deviceId: string): Promise<SiriusDevice> {
    return this.executeWithRecovery(deviceId, async (ip) => {
      const data = await this._fetchDeviceData(ip);
      const config = this.deviceMap[deviceId];
      return {
        ...data,
        displayName: config?.name || '',
      };
    });
  }
}

export default new LocalEsp32DeviceRepository();
