import type { Title } from "./catalogue";
import type { Feedback } from "./preferences";
import type { SeriesProgress } from "./episodes";
import { titleKey } from "./library-state";
export type StatsInput = {
  feedback: Feedback[];
  reviews: { title: Title; rating: number | null; note: string }[];
  progressEntries: { title: Title; progress: SeriesProgress }[];
};
export function viewingStats(input: StatsInput) {
  const watched = [
      ...new Map(input.feedback.filter((f) => f.watched).map((f) => [titleKey(f.title), f.title])).values(),
    ],
    genres = new Map<string, number>();
  for (const title of watched)
    for (const genre of new Set(title.genres)) genres.set(genre, (genres.get(genre) || 0) + 1);
  const ratings = [
    ...new Map(
      input.reviews
        .filter((r) => typeof r.rating === "number" && r.rating >= 1 && r.rating <= 5)
        .map((r) => [titleKey(r.title), r]),
    ).values(),
  ].sort((a, b) => b.rating! - a.rating! || a.title.name.localeCompare(b.title.name));
  const progress = [
    ...new Map(
      input.progressEntries
        .filter((p) => p.title.kind === "series")
        .map((p) => [titleKey(p.title), p.progress]),
    ).values(),
  ];
  const episodes = progress.reduce(
    (total, p) =>
      total +
      Object.entries(p.episodes).reduce(
        (n, [season, items]) =>
          n +
          (/^\d+$/.test(season)
            ? Object.entries(items).filter(
                ([episode, done]) => /^\d+$/.test(episode) && Number(episode) > 0 && done === true,
              ).length
            : 0),
        0,
      ),
    0,
  );
  return {
    films: watched.filter((t) => t.kind === "movie").length,
    series: watched.filter((t) => t.kind === "series").length,
    episodes,
    ratingCount: ratings.length,
    averageRating: ratings.length ? ratings.reduce((n, r) => n + r.rating!, 0) / ratings.length : null,
    genres: [...genres]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 6),
    highestRated: ratings.slice(0, 8),
  };
}
