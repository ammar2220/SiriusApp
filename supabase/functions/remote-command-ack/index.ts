import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    // 1. Authenticate Broker Uplink
    const brokerSecret = Deno.env.get('EMQX_WEBHOOK_SECRET');
    const providedSecret = req.headers.get('X-Sirius-Broker-Secret');

    if (!brokerSecret || providedSecret !== brokerSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized broker' }), { status: 401 });
    }

    // EMQX tests a new HTTP connector with an empty request. It has already
    // passed the shared-secret check above, so acknowledge that probe without
    // touching command state. Real deliveries still require the full envelope.
    const rawBody = await req.text();
    if (!rawBody.trim()) {
      return new Response(JSON.stringify({ status: 'ready' }), { status: 200 });
    }

    // EMQX HTTP Data Integration can send either the event directly or under
    // a `data` property, depending on the rule template. Accept both forms
    // while retaining the same strict topic and payload validation below.
    const body = JSON.parse(rawBody);
    if (body && typeof body === 'object' && Object.keys(body).length === 0) {
      return new Response(JSON.stringify({ status: 'ready' }), { status: 200 });
    }
    const payload = body?.data ?? body;

    // Validate EMQX Payload Shape
    if (!payload || typeof payload.topic !== 'string' || !payload.payload) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { status: 400 });
    }

    let cmdData = payload.payload;
    if (typeof cmdData === 'string') {
      try {
        cmdData = JSON.parse(cmdData);
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid ACK JSON payload' }), { status: 400 });
      }
    }

    // Strict Field Validation
    // 1. Types and Formats
    if (typeof cmdData.commandId !== 'string' || cmdData.commandId.length < 32 || cmdData.commandId.length > 64) {
      return new Response(JSON.stringify({ error: 'Invalid commandId format' }), { status: 400 });
    }
    if (typeof cmdData.status !== 'string' || (cmdData.status.toLowerCase() !== 'accepted' && cmdData.status.toLowerCase() !== 'rejected')) {
      return new Response(JSON.stringify({ error: 'Invalid status value' }), { status: 400 });
    }
    if (typeof cmdData.deviceId !== 'string' || cmdData.deviceId.length < 8 || cmdData.deviceId.length > 32) {
      return new Response(JSON.stringify({ error: 'Invalid deviceId format' }), { status: 400 });
    }
    if (!Number.isSafeInteger(cmdData.enrollmentGeneration) || cmdData.enrollmentGeneration < 1) {
      return new Response(JSON.stringify({ error: 'Invalid enrollmentGeneration' }), { status: 400 });
    }
    if (typeof cmdData.sessionId !== 'string' || cmdData.sessionId.length < 8 || cmdData.sessionId.length > 64) {
      return new Response(JSON.stringify({ error: 'Invalid sessionId format' }), { status: 400 });
    }
    // 2. Numeric Bounds (Finite non-negative integers)
    if (!Number.isInteger(cmdData.bootCount) || cmdData.bootCount < 0) {
      return new Response(JSON.stringify({ error: 'Invalid bootCount: must be non-negative integer' }), { status: 400 });
    }
    if (!Number.isInteger(cmdData.resultingRevision) || cmdData.resultingRevision < 0) {
      return new Response(JSON.stringify({ error: 'Invalid resultingRevision: must be non-negative integer' }), { status: 400 });
    }
    // 3. Reason validation (Optional, must be string if present)
    if (cmdData.hasOwnProperty('reason')) {
      if (typeof cmdData.reason !== 'string' || (cmdData.reason && cmdData.reason.length > 255)) {
        return new Response(JSON.stringify({ error: 'Invalid reason: must be string <= 255 chars' }), { status: 400 });
      }
    }


    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 3. Identity & Payload Verification
    // Fetch the original command payload stored in command_log
    const { data: commandRecord, error: cmdError } = await supabaseClient
      .from('command_log')
      .select('device_id, payload')
      .eq('command_id', cmdData.commandId)
      .single();

    if (cmdError || !commandRecord) {
      return new Response(JSON.stringify({ error: 'Command record not found' }), { status: 404 });
    }

    const originalPayload = commandRecord.payload;
    if (!originalPayload) {
      return new Response(JSON.stringify({ error: 'Original command payload missing' }), { status: 500 });
    }

    // Verify ACK metadata against the trusted stored command
    if (cmdData.deviceId !== originalPayload.deviceId ||
        cmdData.enrollmentGeneration !== originalPayload.enrollmentGeneration ||
        cmdData.bootCount !== originalPayload.expectedBootCount ||
        cmdData.sessionId !== originalPayload.expectedSessionId) {
      return new Response(JSON.stringify({ error: 'ACK metadata mismatch with original command' }), { status: 400 });
    }
    if (cmdData.resultingRevision < originalPayload.expectedRevision) {
      return new Response(JSON.stringify({ error: 'ACK revision predates the command fence' }), { status: 409 });
    }

    // Verify Topic: must be sirius/ack/${factoryId}
    const { data: device, error: devError } = await supabaseClient
      .from('devices')
      .select('factory_id, enrollment_generation, enrollment_status')
      .eq('id', commandRecord.device_id)
      .single();

    if (devError || !device) {
      return new Response(JSON.stringify({ error: 'Device registry mismatch' }), { status: 400 });
    }
    if (device.enrollment_status !== 'ENROLLED' || device.enrollment_generation !== cmdData.enrollmentGeneration) {
      return new Response(JSON.stringify({ error: 'ACK is from a stale or unenrolled device generation' }), { status: 409 });
    }

    const { data: state, error: stateError } = await supabaseClient
      .from('device_state')
      .select('enrollment_generation, boot_count, session_id')
      .eq('factory_id', device.factory_id)
      .maybeSingle();
    if (stateError || !state ||
        state.enrollment_generation !== cmdData.enrollmentGeneration ||
        state.boot_count !== cmdData.bootCount || state.session_id !== cmdData.sessionId) {
      return new Response(JSON.stringify({ error: 'ACK is from a stale device session' }), { status: 409 });
    }

    if (payload.topic !== `sirius/ack/${device.factory_id}`) {
      return new Response(JSON.stringify({ error: 'Topic mismatch' }), { status: 400 });
    }

    // 4. Terminal State Validation
    const firmwareStatus = cmdData.status?.toLowerCase();
    let dbStatus: string | null = null;

    if (firmwareStatus === 'accepted') {
      dbStatus = 'ACKED';
    } else if (firmwareStatus === 'rejected') {
      dbStatus = 'FAILED';
    } else {
      return new Response(JSON.stringify({ error: `Invalid terminal status: ${cmdData.status}` }), { status: 400 });
    }

    // 5. Atomic & Idempotent Transition
    // Update only if currently in a non-terminal state (including TIMED_OUT_UNKNOWN)
    // This prevents concurrent ACKs or late ACKs from corrupting terminal state
    const { data: updateData, error: updateError } = await supabaseClient
      .from('command_log')
      .update({
        status: dbStatus,
        resulting_revision: cmdData.resultingRevision,
        error_reason: cmdData.reason,
        updated_at: new Date().toISOString(),
      })
      .eq('command_id', cmdData.commandId)
      .neq('status', 'ACKED')
      .neq('status', 'FAILED')
      .select();

    if (updateError) throw updateError;

    if (!updateData || updateData.length === 0) {
      return new Response(JSON.stringify({ status: 'ignored', reason: 'Already terminal' }), { status: 200 });
    }

    return new Response(JSON.stringify({ status: 'updated' }), { status: 200 });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
})
