import { SiriusCommand, CommandResult } from '../types/device';
import LocalEsp32DeviceRepository from './repositories/LocalEsp32DeviceRepository';
import RemoteControlService from './remote/RemoteControlService';

/**
 * ControlRouter is the traffic cop for all device instructions.
 * It decides whether a command should be routed locally (Direct IP)
 * or remotely (via Cloud/MQTT).
 */
class ControlRouter {
  /**
   * Executes a command using the most appropriate transport.
   *
   * @param command The unified command to execute.
   * @returns The authoritative result from the device.
   */
  async execute(command: SiriusCommand): Promise<CommandResult> {
    const { deviceId } = command;

    try {
      // 1. Determine local reachability
      const physicalDevices = LocalEsp32DeviceRepository.getPhysicalDevicesSync();
      const isLocal = !!physicalDevices[deviceId];

      if (isLocal) {
        const localResult = await LocalEsp32DeviceRepository.executeCommand(command);

        // Fallback to remote ONLY for proven pre-dispatch connection failures
        if (localResult.status === 'connection_failed') {
          console.log(`[ControlRouter] Proven pre-dispatch failure for ${deviceId}. Falling back to remote...`);
          // Reuse exact same command identity, payload, and expiry for remote dispatch
          return await RemoteControlService.executeRemote(command);
        }

        return localResult;
      }

      // 2. Remote Routing
      console.log(`[ControlRouter] Device ${deviceId} not registered locally. Routing remotely...`);
      return await RemoteControlService.executeRemote(command);

    } catch (error) {
      console.error(`[ControlRouter] Routing failed for ${command.commandId}:`, error);
      return {
        status: 'rejected',
        commandId: command.commandId,
        reason: `Routing Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

export default new ControlRouter();
