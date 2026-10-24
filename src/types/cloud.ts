import { Home, Room, SiriusDevice, SiriusProduct } from './home';

export interface CloudProfile {
  id: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface CloudHome {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface CloudHomeMember {
  id: string;
  home_id: string;
  user_id: string;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
}

export interface CloudRoom {
  id: string;
  home_id: string;
  name: string;
  type: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudDevice {
  id: string;
  factory_id: string;
  room_id: string;
  name: string;
  product_code: string;
  product_type: string;
  channel_count: number;
  created_at: string;
  updated_at: string;
}

export interface CloudChannel {
  id: string;
  device_id: string;
  channel_index: number;
  name: string | null;
  created_at: string;
  updated_at: string;
}
