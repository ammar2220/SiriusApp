import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

/**
 * Temporary activation for the existing Wi-Fi provisioning product flow.
 *
 * The device is already registered in a Room by the normal add-device flow.
 * This endpoint enables the generation-1 remote-control contract for that
 * record. It does not prove physical possession and must be replaced by the
 * planned device-authenticated enrollment flow before a production release.
 */
serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!bearer) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: { user }, error: authError } = await admin.auth.getUser(bearer);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { factoryId } = await req.json();
    if (typeof factoryId !== "string" || !/^ESP32-[0-9a-f:]{17}$/i.test(factoryId)) {
      return json({ error: "Invalid factoryId" }, 400);
    }

    const { data: device, error: deviceError } = await admin
      .from("devices")
      .select("id, room_id, enrollment_generation, enrollment_status")
      .eq("factory_id", factoryId)
      .single();
    if (deviceError || !device) return json({ error: "Device not found" }, 404);

    const { data: room, error: roomError } = await admin
      .from("rooms")
      .select("home_id")
      .eq("id", device.room_id)
      .single();
    if (roomError || !room) return json({ error: "Device room not found" }, 409);

    const { data: membership, error: membershipError } = await admin
      .from("home_members")
      .select("id")
      .eq("home_id", room.home_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return json({ error: "Forbidden" }, 403);

    if (device.enrollment_status === "REVOKED") {
      return json({ error: "Device remote access has been revoked" }, 409);
    }

    const generation = Math.max(1, Number(device.enrollment_generation) || 1);
    const { data: updated, error: updateError } = await admin
      .from("devices")
      .update({ enrollment_status: "ENROLLED", enrollment_generation: generation, updated_at: new Date().toISOString() })
      .eq("id", device.id)
      .select("factory_id, enrollment_generation, enrollment_status")
      .single();
    if (updateError || !updated) throw updateError ?? new Error("Activation failed");

    return json({
      factoryId: updated.factory_id,
      enrollmentGeneration: updated.enrollment_generation,
      enrollmentStatus: updated.enrollment_status,
      mode: "legacy_remote_evaluation",
    });
  } catch (error) {
    console.error("[activate-legacy-remote-device] failed", error);
    return json({ error: "Remote activation failed" }, 500);
  }
});
