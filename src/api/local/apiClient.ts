import axios from 'axios';
import { DeviceInfo, DeviceState } from '../../types/device';

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
    const response = await client.get('/api/info');
    return response.data;
  }

  async getState(ip: string): Promise<DeviceState> {
    const client = this.createClient(ip);
    const response = await client.get('/api/state');
    return response.data;
  }

  async setPower(ip: string, state: 'on' | 'off'): Promise<{ status: string, state: string }> {
    const client = this.createClient(ip);
    const response = await client.post('/api/control', {
      power: state,
    });
    return response.data;
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
