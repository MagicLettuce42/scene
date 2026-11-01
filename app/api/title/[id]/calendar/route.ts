import { requireSceneMember } from "../../../../../lib/auth/server";
import { hasTMDB, episodeCalendarTMDB } from "../../../../../lib/tmdb";
import { addDays, validCalendarDate } from "../../../../../lib/episode-calendar";
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSceneMember(req);
  if (auth.error) return auth.error;
  const { id } = await params,
    match = /^tmdb-tv-(\d{1,10})$/.exec(id),
    from = new URL(req.url).searchParams.get("from") || "";
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 2147483647 || !validCalendarDate(from))
    return Response.json({ error: "Choose a valid series and week." }, { status: 400 });
  if (!hasTMDB()) return Response.json({ error: "Episode dates are not connected." }, { status: 503 });
  try {
    return Response.json(await episodeCalendarTMDB(Number(match[1]), from, addDays(from, 6)), {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return Response.json({ error: "Episode dates could not load. Please try again." }, { status: 503 });
  }
}
