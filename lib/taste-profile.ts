import { sameTitle, type Title } from "./catalogue";
import type { Feedback } from "./preferences";

export type TasteRating = { title: Title; rating: number | null };
export type TasteSource = { title: Title; liked: boolean; hidden: boolean; rating: number | null };
export type TasteBucket = { label: string; count: number };

// A descriptive profile of the whole positive library, not the capped For you seed list.
// Keep this pure: no extra persistence, personal-data requests or recommendation changes.
export function tasteProfile(feedback: Feedback[], ratings: TasteRating[]) {
  const entries: TasteSource[] = [];
  function entry(title: Title) {
    let item = entries.find(e => sameTitle(e.title, title));
    if (!item) {
      item = { title, liked: false, hidden: false, rating: null };
      entries.push(item);
    }
    return item;
  }
  for (const f of feedback) {
    const item = entry(f.title);
    item.liked ||= f.liked;
    item.hidden ||= f.hidden;
  }
  for (const r of ratings) {
    const item = entry(r.title);
    if (Number.isInteger(r.rating) && r.rating! >= 1 && r.rating! <= 5) item.rating = r.rating;
  }
  const sources = entries.filter(e => !e.hidden && (e.rating === null || e.rating >= 4) &&
    (e.liked || (e.rating ?? 0) >= 4)).sort((a, b) => a.title.name.localeCompare(b.title.name, "en"));
  const genres = new Map<string, number>(), decades = new Map<string, number>();
  let genreTitles = 0, yearTitles = 0;
  for (const { title } of sources) {
    const labels = [...new Set(title.genres.map(g => g.trim()).filter(Boolean))];
    if (labels.length) genreTitles++;
    for (const label of labels) genres.set(label, (genres.get(label) ?? 0) + 1);
    if (Number.isInteger(title.year) && title.year! >= 1870 && title.year! <= 2100) {
      const label = `${Math.floor(title.year! / 10) * 10}s`;
      decades.set(label, (decades.get(label) ?? 0) + 1);
      yearTitles++;
    }
  }
  const buckets = (map: Map<string, number>): TasteBucket[] => [...map].map(([label, count]) => ({ label, count }));
  const films = sources.filter(e => e.title.kind === "movie").length;
  return {
    sources, total: sources.length, films, series: sources.length - films,
    genres: buckets(genres).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "en")),
    decades: buckets(decades).sort((a, b) => b.count - a.count || b.label.localeCompare(a.label, "en")),
    genreTitles, yearTitles,
  };
}
