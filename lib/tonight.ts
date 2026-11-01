import { type Title } from "./catalogue";
import { visibleSuggestions, type Feedback } from "./preferences";

export const moods = [
  { key: "any", label: "Surprise me", genre: "all" },
  { key: "laugh", label: "Make me laugh", genre: "Comedy" },
  { key: "adventure", label: "An adventure", genre: "Adventure", tvGenre: "Action & Adventure" },
  { key: "gripping", label: "Something gripping", genre: "Thriller", tvGenre: "Mystery" },
  { key: "escape", label: "Another world", genre: "Fantasy", tvGenre: "Sci-Fi & Fantasy" },
  { key: "real", label: "A true story", genre: "Documentary" },
  { key: "drama", label: "A good drama", genre: "Drama" },
] as const;
export const timeLimits = [30, 60, 90, 120, 180, 0];
export function tonightCandidates(titles: Title[], feedback: Feedback[], minutes: number) {
  return visibleSuggestions(titles, feedback, true).filter(
    (t) => !minutes || (typeof t.runtime === "number" && t.runtime > 0 && t.runtime <= minutes),
  );
}
export function chooseThree(titles: Title[], previous: string[] = []) {
  const fresh = titles.filter((t) => !previous.includes(t.id));
  for (let i = fresh.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
  }
  return fresh.slice(0, 3);
}
