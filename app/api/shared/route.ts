import { requireSceneMember } from "../../../lib/auth/server";
import { cleanTitle } from "../../../lib/library-state";
import { validUuid } from "../../../lib/shared-lists";
const reply = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
type Access = Awaited<ReturnType<typeof requireSceneMember>>;
async function call(access: Access, action: string, data: Record<string, unknown>) {
  const result = await access.client!.rpc("scene_social", { p_action: action, p_data: data });
  if (result.error) {
    const e = result.error;
    return reply(
      {
        error: ["42501", "22023"].includes(e.code)
          ? e.message
          : "The shared list could not be updated. Refresh and try again.",
      },
      e.code === "42501" ? 403 : ["22023", "22P02"].includes(e.code) ? 400 : 503,
    );
  }
  return reply(result.data);
}
export async function GET(req: Request) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  const id = new URL(req.url).searchParams.get("id");
  if (id && !validUuid(id)) return reply({ error: "Invalid list." }, 400);
  return call(access, id ? "detail" : "lists", id ? { listId: id } : {});
}
async function hash(token: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function POST(req: Request) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    return reply({ error: "Invalid request." }, 400);
  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > 35000) return reply({ error: "This request is too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }
  if (!body || typeof body !== "object") return reply({ error: "Invalid request." }, 400);
  const action = body.action,
    data: Record<string, unknown> = {};
  if (["inspect", "join"].includes(action)) {
    if (typeof body.token !== "string" || !/^[a-f\d]{64}$/.test(body.token))
      return reply({ error: "Invalid invitation link." }, 400);
    return call(access, action, { hash: await hash(body.token) });
  }
  if (action === "create") {
    if (!validUuid(body.id)) return reply({ error: "Invalid list." }, 400);
    data.id = body.id;
  } else {
    if (!validUuid(body.listId)) return reply({ error: "Invalid list." }, 400);
    data.listId = body.listId;
  }
  if (["create", "rename"].includes(action)) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.trim().length > 80)
      return reply({ error: "Use a list name of 1–80 characters." }, 400);
    data.name = body.name.trim();
  } else if (action === "invite") {
    if (typeof body.email !== "string" || body.email.length > 254 || !/^\S+@\S+\.\S+$/.test(body.email))
      return reply({ error: "Enter their Scene email address." }, 400);
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
      n.toString(16).padStart(2, "0"),
    ).join("");
    const response = await call(access, action, {
      ...data,
      email: body.email.trim(),
      hash: await hash(token),
    });
    if (!response.ok) return response;
    return reply({ url: new URL("/#shared=" + token, req.url).toString() });
  } else if (action === "add") {
    const title = cleanTitle(body.title);
    if (!title?.tmdbId) return reply({ error: "Open a catalogue title before adding it." }, 400);
    data.title = title;
  } else if (["vote", "remove-title"].includes(action)) {
    if (typeof body.key !== "string" || !/^tmdb-(movie|tv)-\d{1,12}$/.test(body.key))
      return reply({ error: "Invalid title." }, 400);
    data.key = body.key;
    if (action === "vote") {
      if (typeof body.value !== "boolean") return reply({ error: "Invalid vote." }, 400);
      data.value = body.value;
    }
  } else if (action === "archive") {
    if (typeof body.value !== "boolean") return reply({ error: "Invalid choice." }, 400);
    data.value = body.value;
  } else if (action === "remove-person") {
    if (!validUuid(body.userId)) return reply({ error: "Invalid person." }, 400);
    data.userId = body.userId;
  } else if (action === "cancel-invite") {
    if (!validUuid(body.inviteId)) return reply({ error: "Invalid invitation." }, 400);
    data.inviteId = body.inviteId;
  } else if (action !== "leave") return reply({ error: "Unknown action." }, 400);
  return call(access, action, data);
}
