import axios from 'axios';
import { DeviceInfo, DeviceStateWire, SiriusCommand, CommandResult } from '../../types/device';

class LocalApiClient {
  private timeout = 5000;

  private createClient(ip: string) {
    return axios.create({
      baseURL: `http://${ip}`,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  async getInfo(ip: string): Promise<DeviceInfo> {
    const client = this.createClient(ip);
    try {
      const response = await client.get('/api/info');
      let data = response.data;

      if (typeof data === 'string') {
        console.log(`[ApiClient] /api/info ${ip} received as string. Content-Type: ${response.headers['content-type']}, Status: ${response.status}`);
        try {
          data = JSON.parse(data);
          console.log(`[ApiClient] /api/info ${ip} JSON.parse SUCCESS`);
        } catch (e) {
          console.log(`[ApiClient] /api/info ${ip} JSON.parse FAILED`);
        }
      }
      return data;
    } catch (e: any) {
      console.log(`[ApiClient-Error] GET /api/info ${ip} -> BaseURL: ${e.config?.baseURL}, URL: ${e.config?.url}, Combined: ${e.config?.baseURL}${e.config?.url}, Code: ${e.code}, Name: ${e.name}, Message: ${e.message}, Status: ${e.response?.status}`);
      throw e;
    }
  }

  async getState(ip: string): Promise<DeviceStateWire> {
    const client = this.createClient(ip);
    try {
      const response = await client.get('/api/state');
      let data = response.data;

      if (typeof data === 'string') {
        console.log(`[ApiClient] /api/state ${ip} received as string. Content-Type: ${response.headers['content-type']}, Status: ${response.status}`);
        try {
          data = JSON.parse(data);
          console.log(`[ApiClient] /api/state ${ip} JSON.parse SUCCESS`);
        } catch (e: any) {
          console.log(`[ApiClient] /api/state ${ip} JSON.parse FAILED. Error: ${e.message}. Length: ${data.length}. Start: ${JSON.stringify(data.slice(0, 500))}${data.length > 500 ? `. End: ${JSON.stringify(data.slice(-250))}` : ''}`);
        }
      }

      return data;
    } catch (e: any) {
      console.log(`[ApiClient-HTTP] GET /api/state ${ip} -> FAILED Status: ${e.response?.status || 'NO_RESPONSE'}, Error: ${e.message}`);
      throw e;
    }
  }

  /**
   * Legacy control method.
   * @deprecated Use sendCommand instead for Unified Control Architecture.
   */
  async setChannelState(ip: string, channel: number, state: 'on' | 'off'): Promise<{ status: string, state: string }> {
    const client = this.createClient(ip);
    const response = await client.post('/api/control', {
      channel,
      state,
    });
    return response.data;
  }

  /**
   * Sends a unified command to the device.
   *
   * This method posts the full SiriusCommand contract to the /api/command endpoint,
   * ensuring end-to-end safety fencing and deduplication.
   */
  async sendCommand(ip: string, command: SiriusCommand): Promise<CommandResult> {
    const client = this.createClient(ip);

    try {
      const response = await client.post('/api/command', command);
      const data = response.data;

      if (data.status === 'accepted') {
        return {
          status: 'accepted',
          commandId: command.commandId,
          resultingRevision: data.revision,
        };
      } else if (data.status === 'rejected') {
        return {
          status: 'rejected',
          commandId: command.commandId,
          reason: data.reason || 'Device rejected the command',
        };
      } else {
        return {
          status: 'rejected',
          commandId: command.commandId,
          reason: `Unknown device response: ${data.status}`,
        };
      }
    } catch (e: any) {
      // 1. Pre-dispatch failures: proven connection refusal or DNS error.
      // Axios codes: ECONNREFUSED, ENOTFOUND are definitely pre-dispatch.
      // Timeout ('ECONNABORTED') is ambiguous because the request may have been sent.
      const isPreDispatch =
        (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') && !e.response;

      if (isPreDispatch) {
        return {
          status: 'connection_failed',
          commandId: command.commandId,
          reason: e.message || 'Proven pre-dispatch connection failure',
        };
      }

      // 2. Confirmed rejection (4xx)
      if (e.response && e.response.status >= 400 && e.response.status < 500) {
        return {
          status: 'rejected',
          commandId: command.commandId,
          reason: e.response.data?.reason || 'Device rejected request',
        };
      }

      // 3. Ambiguous failure (Timeout, 5xx, Connection Reset, etc.)
      // If there's no response, it's likely a timeout or reset - treat as applied_unconfirmed.
      return {
        status: 'applied_unconfirmed',
        commandId: command.commandId,
        reason: e.response?.data?.reason || e.message || 'Network failure; outcome ambiguous',
      };
    }
  }

  async resetProvisioning(ip: string): Promise<{ status: string }> {
    const client = this.createClient(ip);
    const response = await client.post('/api/reset-provisioning');
    return response.data;
  }

  async provision(ip: string, ssid: string, pass: string): Promise<{ status: string }> {
    const client = this.createClient(ip);
    const response = await client.post('/provision', {
      ssid,
      pass,
    });
    return response.data;
  }
}

export default new LocalApiClient();
