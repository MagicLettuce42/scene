import { requireSceneMember } from "../../../lib/auth/server";
import { hasTMDB, upcomingTMDB } from "../../../lib/tmdb";
import { parseUpcomingQuery } from "../../../lib/upcoming";

export async function GET(req: Request) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  const options = parseUpcomingQuery(new URL(req.url).searchParams);
  if (!options) return Response.json({ error: "Invalid release filters." }, { status: 400 });
  if (!hasTMDB())
    return Response.json({ error: "Upcoming releases are not connected yet." }, { status: 503 });
  try {
    return Response.json(await upcomingTMDB(options), {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return Response.json(
      { error: "Upcoming releases could not load. Please try again shortly." },
      { status: 503 },
    );
  }
}
