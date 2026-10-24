-- Phase B: Backend Foundation Migration
-- Goal: Establish core hierarchy and ownership foundation.

-- 1. Profiles (Extends Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Homes
CREATE TABLE IF NOT EXISTS homes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Home Members (Foundation for Sharing)
CREATE TABLE IF NOT EXISTS home_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(home_id, user_id)
);

-- 4. Rooms
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id UUID NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Devices
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id TEXT NOT NULL UNIQUE,
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  product_code TEXT,
  product_type TEXT,
  channel_count INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Channels
CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  channel_index INTEGER NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_id, channel_index),
  CONSTRAINT check_channel_index_positive CHECK (channel_index > 0)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_homes_owner ON homes(owner_id);
CREATE INDEX IF NOT EXISTS idx_home_members_home ON home_members(home_id);
CREATE INDEX IF NOT EXISTS idx_home_members_user ON home_members(user_id);
CREATE INDEX IF NOT EXISTS idx_rooms_home ON rooms(home_id);
CREATE INDEX IF NOT EXISTS idx_devices_room ON devices(room_id);
CREATE INDEX IF NOT EXISTS idx_devices_factory ON devices(factory_id);
CREATE INDEX IF NOT EXISTS idx_channels_device ON channels(device_id);

-- RLS ENABLEMENT
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE homes ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
-- The project existed before this migration was introduced. Preserve matching
-- policies if they are already present instead of failing a first deployment.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can view own profile') THEN
    CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update own profile') THEN
    CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'homes' AND policyname = 'Users can view homes they belong to') THEN
    CREATE POLICY "Users can view homes they belong to" ON homes FOR SELECT USING (EXISTS (SELECT 1 FROM home_members WHERE home_id = homes.id AND user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'homes' AND policyname = 'Owners can manage their homes') THEN
    CREATE POLICY "Owners can manage their homes" ON homes FOR ALL USING (owner_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'home_members' AND policyname = 'Users can view their memberships') THEN
    CREATE POLICY "Users can view their memberships" ON home_members FOR SELECT USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'home_members' AND policyname = 'Owners can manage memberships') THEN
    CREATE POLICY "Owners can manage memberships" ON home_members FOR ALL USING (EXISTS (SELECT 1 FROM homes WHERE id = home_members.home_id AND owner_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rooms' AND policyname = 'Users can view rooms in their homes') THEN
    CREATE POLICY "Users can view rooms in their homes" ON rooms FOR SELECT USING (EXISTS (SELECT 1 FROM home_members WHERE home_id = rooms.home_id AND user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'rooms' AND policyname = 'Users can manage rooms in their homes') THEN
    CREATE POLICY "Users can manage rooms in their homes" ON rooms FOR ALL USING (EXISTS (SELECT 1 FROM home_members WHERE home_id = rooms.home_id AND user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'devices' AND policyname = 'Users can view devices in their homes') THEN
    CREATE POLICY "Users can view devices in their homes" ON devices FOR SELECT USING (EXISTS (SELECT 1 FROM rooms JOIN home_members ON rooms.home_id = home_members.home_id WHERE rooms.id = devices.room_id AND home_members.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'devices' AND policyname = 'Users can manage devices in their homes') THEN
    CREATE POLICY "Users can manage devices in their homes" ON devices FOR ALL USING (EXISTS (SELECT 1 FROM rooms JOIN home_members ON rooms.home_id = home_members.home_id WHERE rooms.id = devices.room_id AND home_members.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'channels' AND policyname = 'Users can view channels in their homes') THEN
    CREATE POLICY "Users can view channels in their homes" ON channels FOR SELECT USING (EXISTS (SELECT 1 FROM devices JOIN rooms ON devices.room_id = rooms.id JOIN home_members ON rooms.home_id = home_members.home_id WHERE devices.id = channels.device_id AND home_members.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'channels' AND policyname = 'Users can manage channels in their homes') THEN
    CREATE POLICY "Users can manage channels in their homes" ON channels FOR ALL USING (EXISTS (SELECT 1 FROM devices JOIN rooms ON devices.room_id = rooms.id JOIN home_members ON rooms.home_id = home_members.home_id WHERE devices.id = channels.device_id AND home_members.user_id = auth.uid()));
  END IF;
END
$$;
