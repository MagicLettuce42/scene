import { services } from "./catalogue";
import { parseExtraFilters, noExtraFilters, type ExtraFilters } from "./catalogue-filters";
export type FilterPreset = {
  id: string; name: string; view: "discover" | "films" | "series" | "watchlist";
  provider: string; genre: string; sort: string; hideWatched: boolean; extra: ExtraFilters;
};
export function cleanPreset(value: unknown): FilterPreset | null {
  const v = value as FilterPreset;
  if (!v || typeof v !== "object" || !/^[a-f\d-]{36}$/i.test(v.id) ||
    typeof v.name !== "string" || !v.name.trim() || v.name.trim().length > 40 ||
    !["discover", "films", "series", "watchlist"].includes(v.view) ||
    (v.provider !== "mine" && !services.some(s => s.key === v.provider)) ||
    typeof v.genre !== "string" || v.genre.length > 80 ||
    !["recommended", "newest", "rating", "az"].includes(v.sort) || typeof v.hideWatched !== "boolean") return null;
  const extra = parseExtraFilters(new URLSearchParams(Object.entries(v.extra || noExtraFilters())
    .filter(([, x]) => x !== null).map(([k, x]) => [k, String(x)])));
  return extra ? { id: v.id, name: v.name.trim(), view: v.view, provider: v.provider, genre: v.genre,
    sort: v.sort, hideWatched: v.hideWatched, extra } : null;
}
export type RecommendationMode = "balanced" | "familiar" | "adventurous";
export const isRecommendationMode = (v: unknown): v is RecommendationMode =>
  ["balanced", "familiar", "adventurous"].includes(v as string);
