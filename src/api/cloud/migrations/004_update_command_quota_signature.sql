-- Forward Migration: Update check_and_insert_command signature
-- PostgreSQL cannot REPLACE a function if the return type (RETURNS TABLE) changes.
-- We must DROP the existing function first to allow the new signature to be applied.

DO $$
BEGIN
    -- Drop the function only if it exists to ensure migration is idempotent
    -- and works on both fresh and existing databases.
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_and_insert_command') THEN
        DROP FUNCTION check_and_insert_command(UUID, UUID, JSONB, TIMESTAMPTZ);
    END IF;
END $$;

-- Re-create the function with the new return signature: (success, record_id, reason, current_status)
CREATE OR REPLACE FUNCTION check_and_insert_command(
  p_device_id UUID,
  p_command_id UUID,
  p_payload JSONB,
  p_expires_at TIMESTAMPTZ
) RETURNS TABLE(success BOOLEAN, record_id UUID, reason TEXT, current_status TEXT) AS $$
DECLARE
  v_count INTEGER;
  v_existing_record RECORD;
BEGIN
  -- 1. Lock the device record to serialize command insertion
  SELECT id INTO v_existing_record FROM devices WHERE id = p_device_id FOR UPDATE;

  IF v_existing_record.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 'DEVICE_NOT_FOUND', NULL;
    RETURN;
  END IF;

  -- 2. Validate expiry timing
  IF p_expires_at <= NOW() OR p_expires_at > (NOW() + INTERVAL '60 seconds') THEN
    RETURN QUERY SELECT false, NULL::UUID, 'INVALID_EXPIRY_WINDOW', NULL;
    RETURN;
  END IF;

  -- 3. Safe Idempotency Check
  SELECT * INTO v_existing_record FROM command_log WHERE command_id = p_command_id;

  IF v_existing_record.id IS NOT NULL THEN
    -- Only treat as a retry if device, payload, and expiry match exactly
    IF v_existing_record.device_id = p_device_id
       AND v_existing_record.payload = p_payload
       AND v_existing_record.expires_at = p_expires_at THEN

      -- Only authorize republish if the command is still PENDING and not expired
      IF v_existing_record.status = 'PENDING' AND v_existing_record.expires_at > NOW() THEN
        RETURN QUERY SELECT true, v_existing_record.id, 'IDEMPOTENT_RETRY', v_existing_record.status;
      ELSE
        -- Terminal status (ACKED/FAILED) or expired: do not republish
        RETURN QUERY SELECT false, v_existing_record.id, 'TERMINAL_OR_EXPIRED', v_existing_record.status;
      END IF;
      RETURN;
    ELSE
      -- CommandId reuse with different parameters is a conflict/attack
      RETURN QUERY SELECT false, NULL::UUID, 'COMMAND_ID_CONFLICT', NULL;
      RETURN;
    END IF;
  END IF;

  -- 4. Count active/recent commands for this device
  SELECT COUNT(*) INTO v_count
  FROM command_log
  WHERE device_id = p_device_id
    AND created_at > (NOW() - INTERVAL '60 seconds');

  IF v_count >= 10 THEN
    RETURN QUERY SELECT false, NULL::UUID, 'QUOTA_EXCEEDED', NULL;
    RETURN;
  END IF;

  -- 5. Insert the command record
  INSERT INTO command_log (device_id, command_id, payload, expires_at, status)
  VALUES (p_device_id, p_command_id, p_payload, p_expires_at, 'PENDING')
  RETURNING id INTO v_existing_record.id;

  RETURN QUERY SELECT true, v_existing_record.id, 'OK', 'PENDING';
END;
$$ LANGUAGE plpgsql;
