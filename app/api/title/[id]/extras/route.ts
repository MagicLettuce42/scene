import { regionalHandler } from "../../../../../lib/region-server";
import { requireSceneMember } from "../../../../../lib/auth/server";
import { extrasTMDB, hasTMDB } from "../../../../../lib/tmdb";
import { requestServices } from "../../../../../lib/request-services";
async function handleGET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  const { id } = await params,
    match = id.match(/^tmdb-(movie|tv)-(\d{1,12})$/),
    filters = requestServices(new URL(req.url).searchParams);
  if (!match || !filters) return Response.json({ error: "Invalid title or services." }, { status: 400 });
  if (!hasTMDB()) return Response.json({ error: "Title extras are not connected." }, { status: 503 });
  try {
    return Response.json(
      await extrasTMDB(match[1] as "movie" | "tv", Number(match[2]), filters.selected, filters.offer),
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch {
    return Response.json(
      { error: "Trailers, cast and similar titles could not load. Please try again." },
      { status: 503 },
    );
  }
}

export const GET = regionalHandler(handleGET);
