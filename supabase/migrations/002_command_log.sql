-- Phase B: Remote Command Durable State
-- Goal: Track command lifecycle, enforce rolling quotas, and provide idempotent ACKs.

CREATE TYPE command_status AS ENUM ('PENDING', 'ACKED', 'FAILED', 'TIMED_OUT_UNKNOWN');

CREATE TABLE IF NOT EXISTS command_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  command_id UUID NOT NULL UNIQUE,
  status command_status NOT NULL DEFAULT 'PENDING',
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  resulting_revision INTEGER,
  error_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cmd_log_device ON command_log(device_id);
CREATE INDEX IF NOT EXISTS idx_cmd_log_cid ON command_log(command_id);
CREATE INDEX IF NOT EXISTS idx_cmd_log_expiry ON command_log(expires_at);

-- RLS
ALTER TABLE command_log ENABLE ROW LEVEL SECURITY;

-- Members can read commands for devices in their homes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'command_log'
      AND policyname = 'Users can view commands for devices in their homes'
  ) THEN
    CREATE POLICY "Users can view commands for devices in their homes" ON command_log FOR SELECT
    USING (EXISTS (SELECT 1 FROM devices JOIN rooms ON devices.room_id = rooms.id
                                         JOIN home_members ON rooms.home_id = home_members.home_id
                                         WHERE devices.id = command_log.device_id AND home_members.user_id = auth.uid()));
  END IF;
END
$$;

-- Command creation and status mutation must be server-side (via service_role)
-- No user-level INSERT/UPDATE policies.
