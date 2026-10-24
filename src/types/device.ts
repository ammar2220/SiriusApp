export interface DeviceInfo {
  id: string;
  ver: string;
  productType: string;
  channelCount: number;
  channels: Array<{
    index: number;
    state: 'on' | 'off';
  }>;
}

/**
 * The authoritative wire format for the /api/state response.
 * This contract MUST be exposed by all firmware builds (1CH/2CH/3CH).
 *
 * Caller Note: Since this does not include factoryId, callers must verify
 * identity via /api/info before trusting the snapshot.
 */
export interface DeviceStateWire {
  sessionId: string;
  revision: number;
  bootCount: number;
  enrollmentGeneration: number;
  channels: Array<{
    index: number;
    state: 'on' | 'off';
  }>;
  rssi: number;
}

export interface DeviceState {
  channels: Array<{
    index: number;
    state: 'on' | 'off';
  }>;
  rssi: number;
  sessionId: string;
  revision: number;
  bootCount: number;
  enrollmentGeneration: number;
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

/**
 * Represents an instruction to change the state of a device channel.
 * Commands are requests and do not guarantee the resulting state.
 *
 * NOTE: commandId allows for deduplication at the firmware/backend level,
 * but the type definition alone does not implement that behavior.
 */
export interface SiriusCommand {
  commandId: string;           // UUID for tracking and deduplication (Client-generated)
  deviceId: string;            // Factory ID (Physical Identity)
  enrollmentGeneration: number; // Monotonic generation for re-enrollment safety
  expectedSessionId: string;   // Must match device's current boot session
  expectedRevision: number;    // Must match device's current state revision
  expectedBootCount: number;   // Must match device's current monotonic boot count
  expiresAt: number;           // Absolute UTC timestamp (ms) after which command is rejected
  target: {
    channel: number;           // 1-based index
    action: 'SET_STATE';       // Idempotent SET semantics only. Prevents toggle-loops.
    value: 'on' | 'off';      // Target state
  };
  source: 'LOCAL_APP' | 'REMOTE_APP' | 'PHYSICAL_BUTTON' | 'SCENE' | 'SCHEDULE';
  timestamp: number;            // Unix epoch milliseconds (Metadata only, NOT for primary ordering)
  correlationId?: string;       // Optional ID to link related commands
}

export type CommandStatus = 'accepted' | 'rejected' | 'applied_unconfirmed' | 'connection_failed';

export interface CommandResult {
  status: CommandStatus;
  commandId: string;
  reason?: string;
  resultingRevision?: number;
}

/**
 * The response from the device confirming the result of a command.
 * Transport timeouts/errors are handled at the network layer and are NOT
 * represented here; this is a device-level acknowledgement.
 */
export type DeviceCommandResponse =
  | { status: 'accepted'; commandId: string; resultingRevision: number }
  | { status: 'rejected'; commandId: string; reason: string }
  | { status: 'applied_unconfirmed'; commandId: string; reason: string }
  | { status: 'connection_failed'; commandId: string; reason: string };
