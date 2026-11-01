import { parseExtraFilters } from "../../../lib/catalogue-filters";
import { requireSceneMember } from "../../../lib/auth/server";
import { discoverTMDB, discoverSections, halloweenTMDB, hasTMDB } from "../../../lib/tmdb";
import { isHalloweenMood } from "../../../lib/halloween";
import { requestServices } from "../../../lib/request-services";
export async function GET(req: Request) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  const p = new URL(req.url).searchParams,
    filters = requestServices(p),
    section = p.get("section"),
    genre = p.get("genre") || "all";
  if (genre.length > 80 || !filters || (section !== "halloween" && !discoverSections.includes(section as any)))
    return Response.json({ error: "Choose valid services and a discovery section." }, { status: 400 });
  const extra = parseExtraFilters(p);
  if (!extra) return Response.json({ error: "Invalid extra filters." }, { status: 400 });
  const mood = p.get("mood") || "all";
  if (section === "halloween" && !isHalloweenMood(mood))
    return Response.json({ error: "Choose a Halloween category." }, { status: 400 });
  const pageText = p.get("page") || "0";
  if (section === "halloween" && (!/^\d{1,3}$/.test(pageText) || Number(pageText) > 500))
    return Response.json({ error: "Choose a valid Halloween page." }, { status: 400 });
  if (!hasTMDB()) return Response.json({ error: "Live discovery is not connected." }, { status: 503 });
  try {
    const data =
      section === "halloween" && isHalloweenMood(mood)
        ? await halloweenTMDB(mood, filters.selected, filters.offer, genre, extra, Number(pageText))
        : await discoverTMDB(
            section as (typeof discoverSections)[number],
            filters.selected,
            filters.offer,
            genre,
            extra,
          );
    return Response.json(data, {
      headers: { "Cache-Control": data.message ? "private, no-store" : "private, max-age=300" },
    });
  } catch {
    return Response.json({ error: "This section could not load. Please try again." }, {
      status: 503, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
