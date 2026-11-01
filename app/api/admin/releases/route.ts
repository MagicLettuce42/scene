import { requireSceneMember } from "../../../../lib/auth/server";
import { resolveTMDB, hasTMDB } from "../../../../lib/tmdb";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function owner(req: Request) {
  const auth = await requireSceneMember(req);
  if (auth.error) return auth;
  if (auth.member.role !== "owner" || !auth.security.adminReady)
    return {
      ...auth,
      error: reply(
        { error: "Verify your owner security code to manage releases.", code: "OWNER_VERIFY" },
        403,
      ),
    };
  return auth;
}
export async function GET(req: Request) {
  const auth = await owner(req);
  if (auth.error) return auth.error;
  const { data, error } = await auth.client!.rpc("scene_manage_releases", { p_action: "list" });
  return error
    ? reply({ error: "The release dashboard could not load. Verify your security code and try again." }, 503)
    : reply(data);
}
export async function POST(req: Request) {
  const auth = await owner(req);
  if (auth.error) return auth.error;
  let body: any;
  try {
    const raw = await req.text();
    if (raw.length > 8000) throw Error();
    body = JSON.parse(raw);
  } catch {
    return reply({ error: "Invalid release request." }, 400);
  }
  if (body?.action === "artwork") {
    if (
      typeof body.title !== "string" ||
      body.title.trim().length < 1 ||
      body.title.length > 250 ||
      !["movie", "series"].includes(body.kind) ||
      !Number.isInteger(body.year) ||
      body.year < 1888 ||
      body.year > 2200
    )
      return reply({ error: "Enter the original title, type and release year first." }, 400);
    if (!hasTMDB()) return reply({ error: "Artwork lookup is unavailable." }, 503);
    try {
      const title = await resolveTMDB({ name: body.title, kind: body.kind, year: body.year });
      return reply({ tmdb_id: title.tmdbId, poster_url: title.poster });
    } catch {
      return reply(
        {
          error:
            "No unique title matched. Check its original title and year. You can still save the announcement without artwork.",
        },
        422,
      );
    }
  }
  if (
    body?.action !== "save" ||
    !["release", "departure"].includes(body.kind) ||
    !body.record ||
    typeof body.record !== "object" ||
    Array.isArray(body.record) ||
    !(
      body.expected === null ||
      (typeof body.expected === "string" && Number.isFinite(Date.parse(body.expected)))
    )
  )
    return reply({ error: "Invalid release request." }, 400);
  const { data, error } = await auth.client!.rpc("scene_manage_releases", {
    p_action: "save",
    p_kind: body.kind,
    p_record: body.record,
    p_expected: body.expected,
  });
  if (error)
    return reply(
      {
        error:
          error.code === "40001"
            ? "This record changed since you opened it. Reload the dashboard and edit the latest version."
            : error.code === "42501"
              ? "Verify your security code again before saving."
              : "This record could not be saved. Check the dates, title and official provider source link.",
        code: error.code === "42501" ? "OWNER_VERIFY" : undefined,
      },
      error.code === "40001" ? 409 : error.code === "42501" ? 403 : 422,
    );
  return reply({ record: data });
}
