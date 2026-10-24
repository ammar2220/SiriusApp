import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const expectedSecret = Deno.env.get('EMQX_WEBHOOK_SECRET');
  if (!expectedSecret || req.headers.get('X-Sirius-Broker-Secret') !== expectedSecret) {
    return json({ error: 'Unauthorized broker' }, 401);
  }

  try {
    // EMQX tests a new HTTP connector with an empty request. It has already
    // passed the shared-secret check above, so acknowledge that probe without
    // accepting or changing device state.
    const rawBody = await req.text();
    if (!rawBody.trim()) return json({ status: 'ready' });
    const body = JSON.parse(rawBody);
    if (body && typeof body === 'object' && Object.keys(body).length === 0) {
      return json({ status: 'ready' });
    }
    const topic = body?.topic ?? body?.data?.topic;
    let payload = body?.payload ?? body?.data?.payload;
    if (typeof payload === 'string') payload = JSON.parse(payload);
    if (typeof topic !== 'string' || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return json({ error: 'Invalid uplink envelope' }, 400);
    }

    const match = /^sirius\/devices\/(ESP32-[A-Za-z0-9:_-]{1,24})\/(state|presence)$/.exec(topic);
    if (!match) return json({ error: 'Unsupported uplink topic' }, 400);
    const [, factoryId, kind] = match;
    const { enrollmentGeneration, bootCount, sessionId } = payload;
    if (!Number.isSafeInteger(enrollmentGeneration) || enrollmentGeneration < 1 ||
        !Number.isSafeInteger(bootCount) || bootCount < 1 ||
        typeof sessionId !== 'string' || sessionId.length < 1 || sessionId.length > 64) {
      return json({ error: 'Invalid device fencing identity' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    let accepted = false;
    if (kind === 'state') {
      if (!Array.isArray(payload.channels) || payload.channels.length < 1 || payload.channels.length > 8 ||
          payload.channels.some((channel: any) => !Number.isSafeInteger(channel?.index) || channel.index < 1 || channel.index > 8 || !['on', 'off'].includes(channel?.state)) ||
          !Number.isSafeInteger(payload.revision) || payload.revision < 0 ||
          !Number.isInteger(payload.rssi)) {
        return json({ error: 'Invalid full-state snapshot' }, 400);
      }
      const { data, error } = await admin.rpc('apply_device_state_snapshot', {
        p_factory_id: factoryId,
        p_enrollment_generation: enrollmentGeneration,
        p_boot_count: bootCount,
        p_session_id: sessionId,
        p_revision: payload.revision,
        p_state_json: { channels: payload.channels },
        p_rssi: payload.rssi,
      });
      if (error) throw error;
      accepted = data === true;
    } else {
      if (payload.status !== 'online' && payload.status !== 'offline') {
        return json({ error: 'Invalid presence status' }, 400);
      }
      const { data, error } = await admin.rpc('apply_device_presence', {
        p_factory_id: factoryId,
        p_enrollment_generation: enrollmentGeneration,
        p_boot_count: bootCount,
        p_session_id: sessionId,
        p_connection_status: payload.status,
      });
      if (error) throw error;
      accepted = data === true;
    }

    // Duplicate deliveries and stale sessions are safely acknowledged as ignored.
    return json({ status: accepted ? 'applied' : 'ignored_stale_or_duplicate' });
  } catch (error) {
    console.error('[device-uplink] Processing failed', error);
    return json({ error: 'Uplink processing failed' }, 500);
  }
});
