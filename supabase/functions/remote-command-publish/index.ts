import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

interface SiriusCommand {
  commandId: string;
  deviceId: string;
  enrollmentGeneration: number;
  expectedSessionId: string;
  expectedRevision: number;
  expectedBootCount: number;
  expiresAt: number;
  target: {
    channel: number;
    action: 'SET_STATE';
    value: 'on' | 'off';
  };
  source: string;
  timestamp: number;
}

serve(async (req) => {
  // CORS handling for Supabase Function invocation
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  try {
    const authHeader = req.headers.get('Authorization')!;
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const { command }: { command: SiriusCommand } = await req.json();

    // 1. Strict Contract Validation
    if (!command || typeof command.commandId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(command.commandId) ||
        typeof command.deviceId !== 'string') {
      return new Response(JSON.stringify({ error: 'Invalid command identity' }), { status: 400 });
    }
    if (!Number.isSafeInteger(command.enrollmentGeneration) || command.enrollmentGeneration < 1 ||
        !Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0 ||
        !Number.isSafeInteger(command.expectedBootCount) || command.expectedBootCount < 1 ||
        typeof command.expectedSessionId !== 'string' || command.expectedSessionId.length < 1 || command.expectedSessionId.length > 64) {
      return new Response(JSON.stringify({ error: 'Invalid safety fence parameters' }), { status: 400 });
    }
    if (!command.target || typeof command.target.channel !== 'number' || command.target.channel < 1 || command.target.channel > 8 || command.target.action !== 'SET_STATE') {
      return new Response(JSON.stringify({ error: 'Invalid target specification' }), { status: 400 });
    }
    if (command.target.value !== 'on' && command.target.value !== 'off') {
      return new Response(JSON.stringify({ error: 'Invalid target value' }), { status: 400 });
    }
    if (typeof command.expiresAt !== 'number' || !Number.isSafeInteger(command.expiresAt) ||
        command.expiresAt <= Date.now() || command.expiresAt > Date.now() + 60_000) {
      return new Response(JSON.stringify({ error: 'Command already expired or invalid TTL' }), { status: 400 });
    }

    // 2. Trust-based Identity Resolution
    const { data: device, error: deviceError } = await supabaseClient
      .from('devices')
      .select('id, factory_id, room_id, channel_count, enrollment_generation, enrollment_status')
      .eq('factory_id', command.deviceId)
      .single();

    if (deviceError || !device) {
      return new Response(JSON.stringify({ error: 'Device not found in registry' }), { status: 404 });
    }

    if (device.factory_id !== command.deviceId) {
      return new Response(JSON.stringify({ error: 'Identity mismatch' }), { status: 400 });
    }
    if (device.enrollment_status !== 'ENROLLED' || device.enrollment_generation !== command.enrollmentGeneration) {
      return new Response(JSON.stringify({ error: 'Device is not enrolled for this command generation' }), { status: 409 });
    }
    if (command.target.channel > device.channel_count) {
      return new Response(JSON.stringify({ error: 'Target channel is outside this device product range' }), { status: 400 });
    }

    const { data: state, error: stateError } = await supabaseClient
      .from('device_state')
      .select('enrollment_generation, boot_count, session_id, revision')
      .eq('factory_id', device.factory_id)
      .maybeSingle();
    if (stateError || !state ||
        state.enrollment_generation !== command.enrollmentGeneration ||
        state.boot_count !== command.expectedBootCount ||
        state.session_id !== command.expectedSessionId ||
        state.revision !== command.expectedRevision) {
      return new Response(JSON.stringify({ error: 'Command fence does not match authoritative device state' }), { status: 409 });
    }

    // 3. Explicit Membership Validation
    const { data: room, error: roomError } = await supabaseClient
      .from('rooms')
      .select('home_id')
      .eq('id', device.room_id)
      .single();

    if (roomError || !room) {
      return new Response(JSON.stringify({ error: 'Device is not assigned to a valid room' }), { status: 500 });
    }

    const { data: membership, error: memError } = await supabaseClient
      .from('home_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('home_id', room.home_id)
      .single();

    if (memError || !membership) {
      return new Response(JSON.stringify({ error: 'Forbidden: User not a member of device home' }), { status: 403 });
    }

    // 4. Atomic Quota & Idempotent Row Creation
    const { data: quotaData, error: quotaError } = await supabaseClient.rpc('check_and_insert_command', {
      p_device_id: device.id,
      p_command_id: command.commandId,
      p_payload: command,
      p_expires_at: new Date(command.expiresAt).toISOString(),
    });

    if (quotaError || !quotaData || quotaData.length === 0) {
      return new Response(JSON.stringify({ error: 'Database error during quota check' }), { status: 500 });
    }

    const { success, record_id, reason, current_status } = quotaData[0];

    if (!success) {
      // If the reason is TERMINAL_OR_EXPIRED, we return the existing status as a result
      if (reason === 'TERMINAL_OR_EXPIRED' && current_status) {
        return new Response(JSON.stringify({
          status: current_status === 'ACKED' ? 'accepted' : (current_status === 'FAILED' ? 'rejected' : 'uncertain'),
          commandId: command.commandId,
          reason: `Existing record is terminal: ${current_status}`
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        error: reason || 'Command quota exceeded or invalid'
      }), { status: 429 });
    }

    // 5. Secure Publish to EMQX
    // Official EMQX Cloud v5 Publish API:
    // Endpoint: {api_endpoint}/publish
    // Auth: HTTP Basic Auth (App ID : App Secret)
    const EMQX_PUBLISH_URL = Deno.env.get('EMQX_PUBLISH_URL')!;
    const EMQX_APP_ID = Deno.env.get('EMQX_APP_ID')!;
    const EMQX_APP_SECRET = Deno.env.get('EMQX_APP_SECRET')!;

    const auth = btoa(`${EMQX_APP_ID}:${EMQX_APP_SECRET}`);

    const publishResponse = await fetch(EMQX_PUBLISH_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        topic: `sirius/cmd/${device.factory_id}`, // Use trusted factory_id from DB
        payload: JSON.stringify(command),
        qos: 1,
        retain: false,
      }),
    });

    if (publishResponse.status === 200) {
      return new Response(JSON.stringify({ status: 'published', recordId: record_id }), { status: 200 });
    } else if (publishResponse.status === 202) {
      // No matching subscribers. Durable outcome: FAILED (Broker Non-Delivery)
      // Use .update().select() to verify if we actually changed the row (avoid overwriting a concurrent ACK)
      const { data: updateData, error: updateError } = await supabaseClient
        .from('command_log')
        .update({
          status: 'FAILED',
          error_reason: 'Broker Non-Delivery: No active subscribers',
          updated_at: new Date().toISOString(),
        })
        .eq('command_id', command.commandId)
        .neq('status', 'ACKED')
        .neq('status', 'FAILED')
        .select();

      if (updateError) console.error(`[PublishError] Failed to update 202 status: ${updateError.message}`);

      // RACE RESOLUTION: If updateData is empty, a terminal ACK won the race.
      if (!updateData || updateData.length === 0) {
        const { data: current, error: readError } = await supabaseClient
          .from('command_log')
          .select('status')
          .eq('command_id', command.commandId)
          .single();

        if (!readError && current && (current.status === 'ACKED' || current.status === 'FAILED')) {
          return new Response(JSON.stringify({
            status: current.status === 'ACKED' ? 'accepted' : 'rejected',
            commandId: command.commandId,
            reason: `Race resolved: ${current.status}`
          }), { status: 200 });
        }
        // Safe fallback: ambiguous/reconcilable response if read fails or status is non-terminal
        return new Response(JSON.stringify({
          status: 'uncertain',
          error: 'Outcome ambiguous during broker failure race',
          commandId: command.commandId
        }), { status: 502 });
      }

      return new Response(JSON.stringify({
        status: 'uncertain',
        error: 'No active subscribers for device',
        commandId: command.commandId
      }), { status: 202 });
    } else if (publishResponse.status >= 400 && publishResponse.status < 500) {
      // Confirmed failure (e.g. Auth, Bad Request)
      const { data: updateData, error: updateError } = await supabaseClient
        .from('command_log')
        .update({
          status: 'FAILED',
          error_reason: `Broker Publish Rejected (HTTP ${publishResponse.status})`,
          updated_at: new Date().toISOString(),
        })
        .eq('command_id', command.commandId)
        .neq('status', 'ACKED')
        .neq('status', 'FAILED')
        .select();

      if (updateError) console.error(`[PublishError] Failed to update 4xx status: ${updateError.message}`);

      // RACE RESOLUTION: If updateData is empty, a terminal ACK won the race.
      if (!updateData || updateData.length === 0) {
        const { data: current, error: readError } = await supabaseClient
          .from('command_log')
          .select('status')
          .eq('command_id', command.commandId)
          .single();

        if (!readError && current && (current.status === 'ACKED' || current.status === 'FAILED')) {
          return new Response(JSON.stringify({
            status: current.status === 'ACKED' ? 'accepted' : 'rejected',
            commandId: command.commandId,
            reason: `Race resolved: ${current.status}`
          }), { status: 200 });
        }
        // Safe fallback: ambiguous/reconcilable response if read fails or status is non-terminal
        return new Response(JSON.stringify({
          status: 'uncertain',
          error: 'Outcome ambiguous during broker failure race',
          commandId: command.commandId
        }), { status: 502 });
      }

      return new Response(JSON.stringify({
        status: 'rejected',
        error: 'Broker rejected publish request',
        commandId: command.commandId
      }), { status: publishResponse.status });
    } else {
      // 5xx or Network failure -> Ambiguous outcome (Keep PENDING/UNCERTAIN)
      return new Response(JSON.stringify({
        status: 'uncertain',
        error: 'Broker publish ambiguous',
        commandId: command.commandId
      }), { status: 502 });
    }





  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
})
