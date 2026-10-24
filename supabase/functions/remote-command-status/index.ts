import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!bearer) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: { user }, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const commandId = body?.commandId;
    if (typeof commandId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(commandId)) {
      return json({ error: 'Invalid commandId' }, 400);
    }

    const { data: record, error: recordError } = await admin
      .from('command_log')
      .select('id, device_id, command_id, status, resulting_revision, error_reason, expires_at')
      .eq('command_id', commandId)
      .maybeSingle();
    if (recordError) throw recordError;
    if (!record) return json({ error: 'Command not found' }, 404);

    const { data: device, error: deviceError } = await admin
      .from('devices')
      .select('room_id')
      .eq('id', record.device_id)
      .single();
    if (deviceError || !device) return json({ error: 'Device not found' }, 404);
    const { data: room, error: roomError } = await admin
      .from('rooms')
      .select('home_id')
      .eq('id', device.room_id)
      .single();
    if (roomError || !room) return json({ error: 'Home not found' }, 404);
    const { data: membership, error: memberError } = await admin
      .from('home_members')
      .select('id')
      .eq('user_id', user.id)
      .eq('home_id', room.home_id)
      .maybeSingle();
    if (memberError) throw memberError;
    if (!membership) return json({ error: 'Forbidden' }, 403);

    let status = record.status;
    if (status === 'PENDING' && Date.parse(record.expires_at) <= Date.now()) {
      const { data: changed, error: updateError } = await admin
        .from('command_log')
        .update({ status: 'TIMED_OUT_UNKNOWN', updated_at: new Date().toISOString() })
        .eq('id', record.id)
        .eq('status', 'PENDING')
        .lte('expires_at', new Date().toISOString())
        .select('status')
        .maybeSingle();
      if (updateError) throw updateError;
      if (changed) status = changed.status;
    }

    const { data: latest, error: latestError } = await admin
      .from('command_log')
      .select('command_id, status, resulting_revision, error_reason, expires_at')
      .eq('command_id', commandId)
      .single();
    if (latestError) throw latestError;
    return json({ record: latest });
  } catch (error) {
    console.error('[remote-command-status] Status reconciliation failed', error);
    return json({ error: 'Status reconciliation failed' }, 500);
  }
});
