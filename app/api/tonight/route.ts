import { regionalHandler } from "../../../lib/region-server";
import { requireSceneMember } from "../../../lib/auth/server";
import { browseTMDB, hasTMDB } from "../../../lib/tmdb";
import { requestServices } from "../../../lib/request-services";
import { moods, timeLimits } from "../../../lib/tonight";
async function handleGET(req: Request) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  const p = new URL(req.url).searchParams,
    filters = requestServices(p),
    mood = moods.find((m) => m.key === p.get("mood")),
    kind = p.get("kind"),
    minutes = Number(p.get("minutes")),
    page = Number(p.get("page") || 1);
  if (
    !filters ||
    !mood ||
    !["movie", "tv"].includes(kind || "") ||
    !timeLimits.includes(minutes) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 5
  )
    return Response.json({ error: "Choose a mood, time and title type." }, { status: 400 });
  if (!hasTMDB()) return Response.json({ error: "Live suggestions are not connected." }, { status: 503 });
  try {
    const genre = kind === "tv" && "tvGenre" in mood ? mood.tvGenre : mood.genre;
    const data = await browseTMDB({
      kind: kind as "movie" | "tv",
      page,
      provider: "all",
      selected: filters.selected,
      mine: true,
      offer: filters.offer,
      genre,
      sort: "recommended",
      maxRuntime: minutes || undefined,
    });
    const titles = data.titles.filter(
      (t) => !minutes || (typeof t.runtime === "number" && t.runtime > 0 && t.runtime <= minutes),
    );
    return Response.json(
      { titles, hasMore: data.hasMore && page < 5, message: data.message },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch {
    return Response.json(
      { error: "Tonight’s suggestions could not load. Please try again." },
      { status: 503 },
    );
  }
}

export const GET = regionalHandler(handleGET);
