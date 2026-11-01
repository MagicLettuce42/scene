import { requireSceneMember } from "../../../lib/auth/server";
import { cleanTitle } from "../../../lib/library-state";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: Request) {
  const auth = await requireSceneMember(req);
  if (auth.error) return auth.error;
  const [prefs, events, library] = await Promise.all([
    auth.client
      .from("scene_notification_preferences")
      .select("availability_enabled")
      .eq("user_id", auth.user.id)
      .maybeSingle(),
    auth.client
      .from("scene_availability_events")
      .select("id,title,service_key,detected_at")
      .eq("user_id", auth.user.id)
      .eq("dismissed", false)
      .gte("detected_at", new Date(Date.now() - 30 * 86400000).toISOString())
      .order("detected_at", { ascending: false })
      .limit(40),
    auth.client.from("scene_libraries").select("payload").eq("user_id", auth.user.id).maybeSingle(),
  ]);
  if (prefs.error || events.error || library.error)
    return reply({ error: "Your availability alerts could not load. Please try again." }, 503);
  return reply({
    enabled: prefs.data?.availability_enabled === true,
    automatic: library.data?.payload?.preferences?.autoAvailability !== false,
    events: events.data.flatMap((e) => {
      const title = cleanTitle(e.title);
      return title ? [{ id: e.id, title, serviceKey: e.service_key, detectedAt: e.detected_at }] : [];
    }),
  });
}
export async function POST(req: Request) {
  const auth = await requireSceneMember(req);
  if (auth.error) return auth.error;
  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > 1000) throw Error();
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid alert request." }, 400);
  }
  if (
    !(
      (body?.action === "preference" && typeof body.enabled === "boolean") ||
      (body?.action === "dismiss" && typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id))
    )
  )
    return reply({ error: "Invalid alert request." }, 400);
  const { error } = await auth.client.rpc("scene_availability_alert_action", {
    p_action: body.action,
    p_data: body.action === "preference" ? { enabled: body.enabled } : { id: body.id },
  });
  return error
    ? reply({ error: "This change could not be saved. Please try again." }, 422)
    : reply({ ok: true });
}
