-- Release-candidate guardrails for generation-fenced remote commands.
-- A device remains PENDING until a secure device enrollment has completed.
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS enrollment_generation INTEGER,
  ADD COLUMN IF NOT EXISTS enrollment_status TEXT NOT NULL DEFAULT 'PENDING';

UPDATE public.devices
SET enrollment_generation = 1
WHERE enrollment_generation IS NULL OR enrollment_generation < 1;

-- Repair homes created before owner membership became atomic.
INSERT INTO public.home_members(home_id, user_id, role)
SELECT h.id, h.owner_id, 'owner'
FROM public.homes AS h
ON CONFLICT (home_id, user_id) DO NOTHING;

ALTER TABLE public.devices
  ALTER COLUMN enrollment_generation SET DEFAULT 1,
  ALTER COLUMN enrollment_generation SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.devices
    ADD CONSTRAINT devices_enrollment_generation_positive
    CHECK (enrollment_generation > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.devices
    ADD CONSTRAINT devices_enrollment_status_valid
    CHECK (enrollment_status IN ('PENDING', 'ENROLLED', 'REVOKED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Do not allow an app client to promote a device or rewrite its generation.
-- Replace any table-wide grants with the metadata columns the app actually edits.
REVOKE UPDATE ON public.devices FROM anon, authenticated;
GRANT UPDATE (room_id, name, product_code, product_type, channel_count, updated_at)
  ON public.devices TO authenticated;
REVOKE INSERT ON public.devices FROM anon, authenticated;
GRANT INSERT (room_id, factory_id, name, product_code, product_type, channel_count)
  ON public.devices TO authenticated;

-- The authenticated owner is inserted in the same transaction as the home.
DROP FUNCTION IF EXISTS public.create_home_with_owner(TEXT, UUID);
CREATE FUNCTION public.create_home_with_owner(p_name TEXT)
RETURNS TABLE(home_id UUID)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_home UUID;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'INVALID_HOME_NAME'; END IF;

  INSERT INTO homes(owner_id, name) VALUES (v_user, trim(p_name)) RETURNING id INTO v_home;
  INSERT INTO home_members(home_id, user_id, role) VALUES (v_home, v_user, 'owner');
  RETURN QUERY SELECT v_home;
END;
$$;
REVOKE ALL ON FUNCTION public.create_home_with_owner(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_home_with_owner(TEXT) TO authenticated;

-- Only the trusted enrollment backend may advance a device generation.
CREATE OR REPLACE FUNCTION public.advance_device_enrollment_generation(p_factory_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_generation INTEGER;
BEGIN
  UPDATE devices
  SET enrollment_generation = enrollment_generation + 1,
      enrollment_status = 'PENDING',
      updated_at = now()
  WHERE factory_id = p_factory_id
  RETURNING enrollment_generation INTO v_generation;
  IF v_generation IS NULL THEN RAISE EXCEPTION 'DEVICE_NOT_FOUND'; END IF;
  RETURN v_generation;
END;
$$;
REVOKE ALL ON FUNCTION public.advance_device_enrollment_generation(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_device_enrollment_generation(TEXT) TO service_role;

-- State writes are accepted only for the currently enrolled generation and
-- monotonically advance within a boot/session. Stale boots/generations are no-ops.
ALTER TABLE public.device_state
  ADD COLUMN IF NOT EXISTS connection_status TEXT NOT NULL DEFAULT 'offline';

CREATE OR REPLACE FUNCTION public.apply_device_state_snapshot(
  p_factory_id TEXT,
  p_enrollment_generation INTEGER,
  p_boot_count INTEGER,
  p_session_id TEXT,
  p_revision INTEGER,
  p_state_json JSONB,
  p_rssi INTEGER
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_current_generation INTEGER;
DECLARE v_enrollment_status TEXT;
BEGIN
  SELECT enrollment_generation, enrollment_status
    INTO v_current_generation, v_enrollment_status
    FROM devices WHERE factory_id = p_factory_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_enrollment_status <> 'ENROLLED' OR v_current_generation <> p_enrollment_generation THEN RETURN FALSE; END IF;
  IF p_boot_count < 1 OR p_revision < 0 OR length(p_session_id) NOT BETWEEN 1 AND 64 THEN RETURN FALSE; END IF;

  INSERT INTO device_state(factory_id, enrollment_generation, boot_count, session_id, revision, state_json, rssi, last_seen, connection_status)
  VALUES (p_factory_id, p_enrollment_generation, p_boot_count, p_session_id, p_revision, p_state_json, p_rssi, now(), 'online')
  ON CONFLICT (factory_id) DO UPDATE SET
    enrollment_generation = EXCLUDED.enrollment_generation,
    boot_count = EXCLUDED.boot_count,
    session_id = EXCLUDED.session_id,
    revision = EXCLUDED.revision,
    state_json = EXCLUDED.state_json,
    rssi = EXCLUDED.rssi,
    last_seen = now(),
    connection_status = 'online'
  WHERE device_state.enrollment_generation < EXCLUDED.enrollment_generation
     OR (device_state.enrollment_generation = EXCLUDED.enrollment_generation
         AND device_state.boot_count < EXCLUDED.boot_count)
     OR (device_state.enrollment_generation = EXCLUDED.enrollment_generation
         AND device_state.boot_count = EXCLUDED.boot_count
         AND device_state.session_id = EXCLUDED.session_id
         AND device_state.revision <= EXCLUDED.revision);
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_device_state_snapshot(TEXT, INTEGER, INTEGER, TEXT, INTEGER, JSONB, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_device_state_snapshot(TEXT, INTEGER, INTEGER, TEXT, INTEGER, JSONB, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_device_presence(
  p_factory_id TEXT,
  p_enrollment_generation INTEGER,
  p_boot_count INTEGER,
  p_session_id TEXT,
  p_connection_status TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_connection_status NOT IN ('online', 'offline') THEN RETURN FALSE; END IF;
  UPDATE device_state AS s
  SET connection_status = p_connection_status,
      last_seen = CASE WHEN p_connection_status = 'online' THEN now() ELSE s.last_seen END
  FROM devices AS d
  WHERE s.factory_id = p_factory_id
    AND d.factory_id = s.factory_id
    AND d.enrollment_status = 'ENROLLED'
    AND d.enrollment_generation = p_enrollment_generation
    AND s.enrollment_generation = p_enrollment_generation
    AND s.boot_count = p_boot_count
    AND s.session_id = p_session_id;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_device_presence(TEXT, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_device_presence(TEXT, INTEGER, INTEGER, TEXT, TEXT) TO service_role;

-- Client command records remain read-only; publish/ACK mutations use service_role.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'command_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.command_log;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'device_state'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.device_state;
  END IF;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
