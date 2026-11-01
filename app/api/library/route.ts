import { applyAvailabilitySnapshots } from "../../../lib/watchlist-snapshots";
import { readReleaseFeed } from "../../../lib/release-feed";
import { requireSceneMember } from "../../../lib/auth/server";
import {
  applyMutation,
  canUndoMutation,
  emptyLibrary,
  validateMutation,
  type LibraryDocument,
} from "../../../lib/library-state";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
type Auth = Awaited<ReturnType<typeof requireSceneMember>>;
async function read(auth: Auth) {
  const { data, error } = await auth
    .client!.from("scene_libraries")
    .select("payload,revision")
    .eq("user_id", auth.user!.id)
    .maybeSingle();
  if (error) throw error;
  let document = (data?.payload as LibraryDocument) || emptyLibrary();
  if (document.preferences?.autoAvailability !== false) {
    const [snapshots, feed] = await Promise.all([
      auth
        .client!.from("scene_watchlist_snapshots")
        .select("title_key,title,checked_at,last_error")
        .eq("user_id", auth.user!.id),
      readReleaseFeed(auth.client!),
    ]);
    if (!snapshots.error) document = applyAvailabilitySnapshots(document, snapshots.data || [], feed.entries);
  }
  return { document, revision: Number(data?.revision) || 0, exists: !!data };
}
export async function GET(req: Request) {
  const auth = await requireSceneMember(req);
  if (auth.error) return auth.error;
  try {
    return reply({ userId: auth.user.id, ...(await read(auth)) });
  } catch {
    return reply({ error: "Your library could not load. Please try again." }, 503);
  }
}
export async function POST(req: Request) {
  const auth = await requireSceneMember(req);
  if (auth.error) return auth.error;
  if (
    !req.headers.get("content-type")?.startsWith("application/json") ||
    Number(req.headers.get("content-length") || 0) > 750000
  )
    return reply({ error: "Invalid library update." }, 400);
  let input;
  try {
    const raw = await req.text();
    if (raw.length > 750000) return reply({ error: "This update is too large." }, 413);
    input = validateMutation(JSON.parse(raw));
  } catch {
    return reply({ error: "Invalid library update." }, 400);
  }
  if (!input) return reply({ error: "Invalid library update." }, 400);
  try {
    let current = await read(auth);
    if (current.document.receipts.includes(input.mutation.id)) {
      const index = current.document.receipts.indexOf(input.mutation.id);
      const before = { ...current.document, receipts: current.document.receipts.slice(0, index) };
      return reply({ userId: auth.user.id, ...current, undoSkipped: Boolean(input.mutation.undoOf &&
        !canUndoMutation(before, input.mutation.undoOf, input.mutation.undoBase ?? null)) });
    }
    if (input.revision !== current.revision)
      return reply(
        { userId: auth.user.id, ...current, error: "Your library changed on another device." },
        409,
      );
    let document: LibraryDocument;
    try {
      document = applyMutation(current.document, input.mutation);
    } catch {
      return reply({ error: "Your library is full. Existing titles can still be updated." }, 422);
    }
    if (JSON.stringify(document).length > 5800000)
      return reply({ error: "Your library has reached its storage limit." }, 422);
    if (!current.exists) {
      const inserted = await auth.client
        .from("scene_libraries")
        .insert({ user_id: auth.user.id, payload: emptyLibrary(), revision: 0 });
      if (inserted.error && inserted.error.code !== "23505") throw inserted.error;
    }
    const result = await auth.client
      .from("scene_libraries")
      .update({ payload: document, revision: current.revision + 1, updated_at: new Date().toISOString() })
      .eq("user_id", auth.user.id)
      .eq("revision", current.revision)
      .select("revision")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data)
      return reply(
        { userId: auth.user.id, ...(await read(auth)), error: "Your library changed on another device." },
        409,
      );
    return reply({ userId: auth.user.id, document, revision: current.revision + 1,
      undoSkipped: Boolean(input.mutation.undoOf && !canUndoMutation(current.document, input.mutation.undoOf, input.mutation.undoBase ?? null)) });
  } catch {
    return reply({ error: "Could not save to your account. Your changes are kept on this device." }, 503);
  }
}
