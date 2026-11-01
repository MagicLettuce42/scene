import { requireSceneMember } from "../../../../../lib/auth/server";
import { hasTMDB, seriesEpisodesTMDB } from "../../../../../lib/tmdb";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  const { id } = await params,
    match = /^tmdb-tv-(\d{1,10})$/.exec(id),
    raw = new URL(req.url).searchParams.get("season");
  if (
    !match ||
    Number(match[1]) < 1 ||
    Number(match[1]) > 2147483647 ||
    (raw !== null && !/^(0|[1-9]\d{0,3})$/.test(raw)) ||
    (raw !== null && Number(raw) > 1000)
  )
    return Response.json({ error: "Invalid series or season." }, { status: 400 });
  if (!hasTMDB()) return Response.json({ error: "Episode information is not connected." }, { status: 503 });
  try {
    return Response.json(await seriesEpisodesTMDB(Number(match[1]), raw === null ? undefined : Number(raw)), {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return Response.json(
      { error: "Episodes could not load. Your saved progress is safe; try again." },
      { status: 503 },
    );
  }
}
