import { regionalHandler } from "../../../lib/region-server";
import { isRecommendationMode } from "../../../lib/filter-presets";
import { requireSceneMember } from "../../../lib/auth/server";
import { emptyLibrary, type LibraryDocument } from "../../../lib/library-state";
import { recommendationSeeds, combineRecommendations } from "../../../lib/personal-recommendations";
import { personalRecommendationsTMDB, hasTMDB } from "../../../lib/tmdb";
import { requestServices } from "../../../lib/request-services";
import { parseExtraFilters } from "../../../lib/catalogue-filters";
const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
async function handleGET(req: Request) {
  const auth = await requireSceneMember(req);
  if (auth.error) return auth.error;
  const p = new URL(req.url).searchParams,
    filters = requestServices(p),
    extra = parseExtraFilters(p),
    genre = p.get("genre") || "all";
  if (!filters || !extra || genre.length > 80)
    return reply({ error: "Choose valid recommendation filters." }, 400);
  if (!hasTMDB()) return reply({ error: "Recommendations are not connected." }, 503);
  try {
    const { data, error } = await auth.client
      .from("scene_libraries")
      .select("payload")
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (error) throw error;
    const doc = (data?.payload || emptyLibrary()) as LibraryDocument,
      seeds = recommendationSeeds(doc),
      mode = isRecommendationMode(doc.preferences?.recommendationMode) ? doc.preferences!.recommendationMode! : "balanced";
    if (!seeds.length) return reply({ picks: [], seedCount: 0, message: null });
    const result = await personalRecommendationsTMDB(seeds, filters.selected, filters.offer, genre, extra, mode);
    return reply({
      picks: combineRecommendations(result.groups, Object.values(doc.entries), 12, mode),
      seedCount: seeds.length,
      message: result.message,
    });
  } catch {
    return reply({ error: "Your recommendations could not load. Try again shortly." }, 503);
  }
}

export const GET = regionalHandler(handleGET);
