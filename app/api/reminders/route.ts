import { regionalHandler, catalogueRegion } from "../../../lib/region-server";
import { requireSceneMember } from "../../../lib/auth/server";
import { validPushSubscription } from "../../../lib/push-validation";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function handleGET(req: Request) {
  const auth = await requireSceneMember(req);
  if (auth.error) return auth.error;
  const [reminders, status, devices] = await Promise.all([
    auth.client
      .from("scene_release_reminders")
      .select("release_id,scene_releases(id,title,release_date,service_key,label,active,source_url)")
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false }),
    auth.client.from("scene_release_status").select("public_vapid_key").eq("id", 1).single(),
    auth.client.from("scene_push_subscriptions").select("endpoint").eq("user_id", auth.user.id),
  ]);
  if (reminders.error || status.error || devices.error)
    return reply({ error: "Reminders could not load. Try again." }, 503);
  return reply({
    reminders: catalogueRegion() === "US" ? [] : reminders.data,
    publicKey: status.data.public_vapid_key,
    endpoints: devices.data.map((d) => d.endpoint),
  });
}
async function handlePOST(req: Request) {
  const auth = await requireSceneMember(req);
  if (auth.error) return auth.error;
  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > 6000) throw Error();
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw Error();
  } catch {
    return reply({ error: "Invalid reminder request." }, 400);
  }
  if (catalogueRegion() === "US" && body.action === "follow") return reply({ error: "US announcement reminders are not available yet." }, 422);
  let data: Record<string, string> = {};
  if (
    ["follow", "unfollow"].includes(body.action) &&
    typeof body.releaseId === "string" &&
    /^[a-z0-9-]{1,80}$/.test(body.releaseId)
  )
    data = { releaseId: body.releaseId };
  else if (body.action === "subscribe" && validPushSubscription(body.subscription))
    data = { endpoint: body.subscription.endpoint, ...body.subscription.keys };
  else if (body.action === "unsubscribe" && typeof body.endpoint === "string" && body.endpoint.length < 2048)
    data = { endpoint: body.endpoint };
  else return reply({ error: "Invalid reminder or unsupported notification service." }, 400);
  const { error } = await auth.client.rpc("scene_reminder_action", { p_action: body.action, p_data: data });
  if (error)
    return reply(
      {
        error:
          body.action === "follow"
            ? "This release could not be followed. It may no longer be upcoming."
            : "This change could not be saved. Try again, or remove an old device.",
      },
      422,
    );
  return reply({ ok: true });
}

export const GET = regionalHandler(handleGET);
export const POST = regionalHandler(handlePOST);
