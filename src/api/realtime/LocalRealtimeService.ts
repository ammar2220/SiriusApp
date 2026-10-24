import { SiriusDevice, SiriusProduct } from '../../types/home';

    // New event type for reachability/baseline failures
    type ReconciliationFailure = {
      type: 'reconciliation_failure';
      deviceId: string;
      error: string;
      timestamp: number;
    };

    export type LocalRealtimeEvent =
      | {
          type: 'state_update';
          deviceId: string;
          product: string;
          sessionId: string;
          bootCount: number;
          enrollmentGeneration: number;
          revision: number;
          timestamp: number;
          state: {
            channels: Array<{ index: number; state: 'on' | 'off' }>;
          };
        }
      | ReconciliationFailure;

export interface DeviceRealtimeState {
  sessionId: string;
  revision: number;
  lastSeen: number;
}

export class LocalRealtimeService {
  private static instance: LocalRealtimeService;
  private connections: Map<string, WebSocket> = new Map();
  private listeners: Array<(event: LocalRealtimeEvent) => void> = [];
  private reconnectTimers: Map<string, any> = new Map();
  private backoffs: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): LocalRealtimeService {
    if (!LocalRealtimeService.instance) {
      LocalRealtimeService.instance = new LocalRealtimeService();
    }
    return LocalRealtimeService.instance;
  }

  subscribe(callback: (event: LocalRealtimeEvent) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  async connect(deviceId: string, ip: string, onReconcile: (baseline: LocalRealtimeEvent) => Promise<void>) {
    if (this.connections.has(deviceId)) {
      console.log(`[Realtime-Debug] Already connected to ${deviceId}, skipping`);
      return;
    }

    // Sanitize IP: remove any existing port (e.g., "192.168.1.8:80" -> "192.168.1.8")
    const host = ip.split(':')[0];
    const url = `ws://${host}:81`;
    console.log(`[Realtime-Debug] Attempting connection to ${deviceId} at ${url}...`);

    try {
      const ws = new WebSocket(url);

      // Buffer for events arriving before REST reconciliation
      const eventBuffer: LocalRealtimeEvent[] = [];
      let isReconciling = true;

      ws.onopen = async () => {
        console.log(`[Realtime-Debug] WebSocket OPENED for ${deviceId}`);
        this.connections.set(deviceId, ws);
        this.backoffs.set(deviceId, 1000);
        this.reconnectTimers.delete(deviceId);

        // RECONCILIATION SEQUENCE
        try {
          console.log(`[Realtime-Debug] Starting reconciliation for ${deviceId}...`);
          // 1. Perform REST snapshot
          const baseline = await this.fetchBaseline(ip);
          console.log(`[Realtime-Debug] Baseline fetched successfully for ${deviceId}. Rev: ${(baseline as Extract<LocalRealtimeEvent, { type: 'state_update' }>).revision}`);

          // 2. Apply buffered events newer than baseline
          const validEvents = eventBuffer.filter((e): e is Extract<LocalRealtimeEvent, { type: 'state_update' }> => {
            if (baseline.type !== 'state_update') return false;

            // Validate event is for the correct device and has finite non-negative integers
            if (e.type !== 'state_update' ||
                e.deviceId !== baseline.deviceId ||
                !Number.isFinite(e.bootCount) || e.bootCount < 0 ||
                !Number.isSafeInteger(e.enrollmentGeneration) || e.enrollmentGeneration < 1 ||
                !Number.isFinite(e.revision) || e.revision < 0) {
              return false;
            }

            return e.sessionId === baseline.sessionId &&
                   e.bootCount === baseline.bootCount &&
                   e.enrollmentGeneration === baseline.enrollmentGeneration &&
                   e.revision > baseline.revision;
          });

          validEvents.sort((a, b) => a.revision - b.revision);

          // Emit baseline first
          this.listeners.forEach(l => l(baseline));

          // Then emit valid buffered events
          validEvents.forEach(e => this.listeners.forEach(l => l(e)));

          // 3. Exit buffering mode
          isReconciling = false;
          console.log(`[Realtime-Debug] Reconciliation complete for ${deviceId}.`);
        } catch (e) {
          console.error(`[Realtime-Debug] Reconciliation failed for ${deviceId}: ${e}`);
          isReconciling = false;
          // Notify listeners of a reconciliation failure without fabricating a state_update
          this.listeners.forEach(l => l({
            type: 'reconciliation_failure',
            deviceId,
            error: e instanceof Error ? e.message : String(e),
            timestamp: Date.now(),
          }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'state_update') {
            // Runtime Validation: Ensure the event matches the expected contract
            if (
              typeof data.deviceId !== 'string' || data.deviceId.trim() === '' ||
              typeof data.sessionId !== 'string' || data.sessionId.trim() === '' ||
              typeof data.bootCount !== 'number' || data.bootCount < 0 ||
              !Number.isSafeInteger(data.enrollmentGeneration) || data.enrollmentGeneration < 1 ||
              typeof data.revision !== 'number' || data.revision < 0 ||
              !Array.isArray(data.state?.channels)
            ) {
              console.error(`[Realtime] Malformed state_update payload from ${data.deviceId || 'unknown'}`);
              return;
            }

            if (isReconciling) {
              console.log(`[Realtime-Debug] Buffering event for ${data.deviceId} during reconciliation`);
              eventBuffer.push(data);
            } else {
              console.log(`[Realtime-Debug] Applying live update for ${data.deviceId}: Rev ${data.revision}`);
              this.listeners.forEach(l => l(data));
            }
          }
        } catch (e) {
          console.error(`[Realtime-Debug] JSON parse error from ${event.data.substring(0, 50)}...`, e);
        }
      };

      ws.onclose = (e) => {
        console.log(`[Realtime-Debug] WebSocket CLOSED for ${deviceId}. Code: ${e.code}, Reason: ${e.reason}`);
        this.connections.delete(deviceId);
        this.scheduleReconnect(deviceId, ip, onReconcile);
      };

      ws.onerror = (err) => {
        console.error(`[Realtime-Debug] WebSocket ERROR for ${deviceId}`, err);
        ws.close();
      };

    } catch (e) {
      console.error(`[Realtime-Debug] Connection setup failed for ${deviceId}: ${e}`);
      this.scheduleReconnect(deviceId, ip, onReconcile);
    }
  }

  private async fetchBaseline(ip: string): Promise<LocalRealtimeEvent> {
    const response = await fetch(`http://${ip}/api/state`);
    const data = await response.json();
    const infoResponse = await fetch(`http://${ip}/api/info`);
    const info = await infoResponse.json();

    // Validate baseline identity and types
    if (!info.id || typeof info.id !== 'string' ||
        typeof data.sessionId !== 'string' || data.sessionId.trim() === '' ||
        typeof data.bootCount !== 'number' || !Number.isFinite(data.bootCount) || data.bootCount < 0 ||
        !Number.isSafeInteger(data.enrollmentGeneration) || data.enrollmentGeneration < 1 ||
        typeof data.revision !== 'number' || !Number.isFinite(data.revision) || data.revision < 0) {
      throw new Error(`Invalid baseline received from ${ip}`);
    }

    return {
      type: 'state_update',
      deviceId: info.id,
      product: info.productType,
      sessionId: data.sessionId,
      bootCount: data.bootCount,
      enrollmentGeneration: data.enrollmentGeneration,
      revision: data.revision,
      timestamp: Date.now(),
      state: {
        channels: data.channels
      }
    };
  }

  private scheduleReconnect(deviceId: string, ip: string, onReconcile: (baseline: LocalRealtimeEvent) => Promise<void>) {
    if (this.reconnectTimers.has(deviceId)) return;

    const delay = this.backoffs.get(deviceId) || 1000;
    const jitter = Math.random() * 1000;

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(deviceId);
      this.backoffs.set(deviceId, Math.min(delay * 2, 30000));
      this.connect(deviceId, ip, onReconcile);
    }, delay + jitter);

    this.reconnectTimers.set(deviceId, timer);
  }

  disconnect(deviceId: string) {
    const ws = this.connections.get(deviceId);
    if (ws) {
      ws.close();
      this.connections.delete(deviceId);
    }
    const timer = this.reconnectTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(deviceId);
    }
  }

  disconnectAll() {
    for (const deviceId of this.connections.keys()) {
      this.disconnect(deviceId);
    }
  }
}

export default LocalRealtimeService.getInstance();
