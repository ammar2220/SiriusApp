import { SiriusCommand, CommandResult } from '../../types/device';
import { supabase } from '../cloud/supabaseClient';
import { FunctionsHttpError } from '@supabase/supabase-js';

/**
 * RemoteControlService handles the interaction with the EMQX Broker
 * via the authenticated Supabase Edge Function gateway.
 */
class RemoteControlService {
  private pendingCommands: Map<string, {
    resolve: (result: CommandResult) => void;
    reject: (error: Error) => void;
    timeout: any;
    channel: any;
  }> = new Map();

  async executeRemote(command: SiriusCommand): Promise<CommandResult> {
    const { commandId } = command;

    return new Promise(async (resolve, reject) => {
      let currentChannel: any = null;
      let timeout: any = null;

      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        if (currentChannel) {
          supabase.removeChannel(currentChannel);
        }
        this.pendingCommands.delete(commandId);
      };

      try {
        // 1. Register tracking immediately
        this.pendingCommands.set(commandId, {
          resolve,
          reject,
          timeout: null,
          channel: null,
        });

        // 2. Create channel and attach handler BEFORE subscribing
        currentChannel = supabase.channel(`cmd_ack_${commandId}`);

        currentChannel.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'command_log',
            filter: `command_id=eq.${commandId}`,
          },
          (payload: any) => {
            const newRecord = payload.new;
            if (newRecord.status !== 'PENDING') {
              const result = this.mapDbStatusToResult(newRecord);
              this.pendingCommands.get(commandId)?.resolve(result);
              cleanup();
            }
          }
        );

        // 3. Await actual Realtime SUBSCRIBED status using the callback API
        await new Promise((res, rej) => {
          const { data: subData } = currentChannel.subscribe((status: any, err: any) => {
            if (status === 'SUBSCRIBED') {
              res(true);
            } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
              rej(new Error(`Realtime connection failure: ${status}`));
            }
          });
          if (subData?.error) rej(subData.error);
        });

        // Now that we are subscribed, set the timeout and save the channel
        timeout = setTimeout(() => {
          this.startBoundedPolling(commandId);
        }, 15000);

        this.pendingCommands.get(commandId)!.timeout = timeout;
        this.pendingCommands.get(commandId)!.channel = currentChannel;

        // 4. Dispatch
        const { data, error } = await supabase.functions.invoke('remote-command-publish', {
          body: { command },
        });

        if (error) {
          // Distinguish between confirmed transport rejections (4xx) and ambiguous failures.
          if (error instanceof FunctionsHttpError) {
            const status = error.context?.status;
            if (typeof status === 'number' && status >= 400 && status < 500) {
              const result: CommandResult = {
                status: 'rejected',
                commandId,
                reason: `Gateway Rejected (HTTP ${status}): ${error.message}`,
              };
              this.pendingCommands.get(commandId)?.resolve(result);
              cleanup();
              return;
            }
          }
          // Network errors, 5xx, etc. are ambiguous. Await reconciliation.
          console.warn(`[RemoteControl] Publish invoke ambiguous error: ${error.message}. Awaiting reconciliation...`);
          return;
        }
        if (data?.error) {
          // Edge Function returned a logic error (e.g. 403 Forbidden)
          // This is a confirmed rejection.
          throw new Error(data.error);
        }

        // 5. Immediate post-publish reconciliation (only for terminal states)
        await this.reconcileAfterPublish(commandId);

      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  private async startBoundedPolling(commandId: string) {
    const MAX_RETRIES = 3;
    const POLL_INTERVAL = 5000;
    let attempts = 0;

    while (attempts < MAX_RETRIES) {
      attempts++;
      console.log(`[RemoteControl] Polling status for ${commandId} (Attempt ${attempts}/${MAX_RETRIES})...`);

      const result = await this.pollStatus(commandId);

      if (result.status !== 'applied_unconfirmed') {
        // Terminal state reached (accepted or rejected)
        const pending = this.pendingCommands.get(commandId);
        if (pending) {
          pending.resolve(result);
          this.cleanupCommand(commandId);
        }
        return;
      }

      if (attempts < MAX_RETRIES) {
        await new Promise<void>(res => setTimeout(res, POLL_INTERVAL));
      }
    }

    // Max retries reached without terminal state
    const pending = this.pendingCommands.get(commandId);
    if (pending) {
      pending.resolve({
        status: 'applied_unconfirmed',
        commandId,
        reason: 'Max polling attempts reached. Status remains unknown.'
      });
      this.cleanupCommand(commandId);
    }
  }

  private async reconcileAfterPublish(commandId: string) {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;

    const { data, error } = await supabase
      .from('command_log')
      .select('*')
      .eq('command_id', commandId)
      .single();

    if (error || !data || data.status === 'PENDING') return;

    const result = this.mapDbStatusToResult(data);
    pending.resolve(result);
    this.cleanupCommand(commandId);
  }

  public async reconcileCommand(commandId: string): Promise<CommandResult> {
    const pending = this.pendingCommands.get(commandId);
    let result: CommandResult;
    try {
      result = await this.reconcileCommandStatus(commandId);
    } catch (e) {
      result = {
        status: 'applied_unconfirmed',
        commandId,
        reason: `Reconciliation read failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
      };
    } finally {
      this.cleanupCommand(commandId);
    }

    if (pending) {
      pending.resolve(result);
    }
    return result;
  }

  private async reconcileCommandStatus(commandId: string): Promise<CommandResult> {
    const { data, error } = await supabase.functions.invoke('remote-command-status', {
      body: { commandId },
    });
    const record = data?.record;

    if (error || !record || record.status === 'PENDING') {
      return {
        status: 'applied_unconfirmed',
        commandId,
        reason: error?.message || 'Device state unknown (row missing or still pending)',
      };
    }

    return this.mapDbStatusToResult(record);
  }

  private cleanupCommand(commandId: string) {
    const pending = this.pendingCommands.get(commandId);
    if (!pending) return;
    if (pending.timeout) clearTimeout(pending.timeout);
    if (pending.channel) supabase.removeChannel(pending.channel);
    this.pendingCommands.delete(commandId);
  }

  private mapDbStatusToResult(record: any): CommandResult {
    const { status, command_id, resulting_revision, error_reason } = record;

    switch (status) {
      case 'ACKED':
        return {
          status: 'accepted',
          commandId: command_id,
          resultingRevision: resulting_revision,
        };
      case 'FAILED':
        return {
          status: 'rejected',
          commandId: command_id,
          reason: error_reason || 'DEVICE_REJECTED',
        };
      case 'TIMED_OUT_UNKNOWN':
        return {
          status: 'applied_unconfirmed',
          commandId: command_id,
          reason: 'Broker timeout but row exists',
        };
      default:
        return {
          status: 'rejected',
          commandId: command_id,
          reason: `UNKNOWN_STATUS: ${status}`,
        };
    }
  }
  async pollStatus(commandId: string): Promise<CommandResult> {
    try {
      return await this.reconcileCommandStatus(commandId);
    } catch (e) {
      return {
        status: 'applied_unconfirmed',
        commandId,
        reason: `Status poll failed: ${e instanceof Error ? e.message : 'Unknown error'}`,
      };
    }
  }
}

export default new RemoteControlService();
