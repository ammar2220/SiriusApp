-- Migration 005: Authoritative Device State and Enrollment Generation
-- 1. Add enrollment_generation to devices for secure claim tracking
ALTER TABLE devices ADD COLUMN IF NOT EXISTS enrollment_generation INTEGER DEFAULT 0;

-- 2. Create authoritative device_state table for real-time reconciliation
CREATE TABLE IF NOT EXISTS public.device_state (
    factory_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    boot_count INTEGER NOT NULL,
    revision INTEGER NOT NULL,
    state_json JSONB NOT NULL,
    rssi INTEGER,
    last_seen TIMESTAMPTZ DEFAULT now(),
    enrollment_generation INTEGER NOT NULL,
    CONSTRAINT fk_device FOREIGN KEY (factory_id) REFERENCES public.devices(factory_id) ON DELETE CASCADE
);

-- 3. Enable RLS for device_state
ALTER TABLE public.device_state ENABLE ROW LEVEL SECURITY;

-- Users can read state for devices in homes they belong to
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'device_state'
      AND policyname = 'Allow members to read device state'
  ) THEN
    CREATE POLICY "Allow members to read device state" ON public.device_state
      FOR SELECT
      USING (
          EXISTS (
              SELECT 1 FROM public.devices d
              JOIN public.rooms r ON d.room_id = r.id
              JOIN public.home_members hm ON r.home_id = hm.home_id
              WHERE d.factory_id = public.device_state.factory_id
              AND hm.user_id = auth.uid()
          )
      );
  END IF;
END
$$;

-- Only the service role (server) can update state
-- (Handled by service_role key in Edge Functions)

-- 4. Atomic Home Creation with Ownership
-- Replace existing logic to ensure home owner is always a member
CREATE OR REPLACE FUNCTION create_home_with_owner(p_name TEXT, p_owner_id UUID)
RETURNS TABLE(home_id UUID) AS $$
DECLARE
    v_home_id UUID;
BEGIN
    -- Insert Home
    INSERT INTO public.homes (name)
    VALUES (p_name)
    RETURNING id INTO v_home_id;

    -- Insert Owner into home_members
    INSERT INTO public.home_members (home_id, user_id)
    VALUES (v_home_id, p_owner_id);

    RETURN QUERY SELECT v_home_id;
END;
$$ LANGUAGE plpgsql;

-- 5. Durable Timeout Transition for command_log
-- This function is intended to be called via pg_cron or a scheduled Edge Function
CREATE OR REPLACE FUNCTION reconcile_expired_commands()
RETURNS INTEGER AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE public.command_log
    SET status = 'TIMED_OUT_UNKNOWN',
        updated_at = now()
    WHERE status = 'PENDING'
      AND expires_at < now();

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;
