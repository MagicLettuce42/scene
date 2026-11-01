import type { RecommendationMode } from "./filter-presets";
import { sameTitle, type Title } from "./catalogue";
import { type LibraryDocument, type LibraryEntry } from "./library-state";

export type PersonalPick = { title: Title; reason: string };
export function recommendationSeeds(document: LibraryDocument): LibraryEntry[] {
  return Object.values(document.entries)
    .filter(
      (e) =>
        e.title.tmdbId &&
        !e.hidden &&
        (e.rating == null || e.rating >= 4) &&
        (e.liked || (e.rating || 0) >= 4),
    )
    .reverse()
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 8);
}
export function isNewSuggestion(title: Title, entries: LibraryEntry[]) {
  const entry = entries.find((e) => sameTitle(e.title, title));
  return (
    !entry ||
    (!entry.hidden &&
      !entry.watched &&
      !entry.liked &&
      !entry.saved &&
      !entry.progress?.tracking &&
      !entry.rating)
  );
}
export function combineRecommendations(
  groups: { seed: LibraryEntry; titles: Title[] }[],
  entries: LibraryEntry[],
  limit = 12,
  mode: RecommendationMode = "balanced",
): PersonalPick[] {
  const picks: PersonalPick[] = [];
  // Alternate source titles so one seed cannot fill the entire personal row.
  for (let i = 0; i < Math.max(0, ...groups.map((g) => g.titles.length)); i++)
    for (const group of groups) {
      const title = group.titles[i];
      if (!title || !isNewSuggestion(title, entries) || picks.some((p) => sameTitle(p.title, title)))
        continue;
      if (mode === "adventurous" && picks.some(p => p.title.genres[0] && p.title.genres[0] === title.genres[0]) &&
          picks.filter(p => p.title.genres[0] === title.genres[0]).length >= 3) continue;
      picks.push({
        title,
        reason:
          group.seed.rating && group.seed.rating >= 4
            ? `Because you rated ${group.seed.title.name} ${group.seed.rating}/5`
            : `Because you liked ${group.seed.title.name}`,
      });
      if (picks.length >= limit) return mode === "familiar" ? picks.sort((a, b) => (b.title.rating || 0) - (a.title.rating || 0)) : picks;
    }
  return mode === "familiar" ? picks.sort((a, b) => (b.title.rating || 0) - (a.title.rating || 0)) : picks;
}
