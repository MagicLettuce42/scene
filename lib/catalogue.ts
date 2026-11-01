import seed from "./seed.json";
import type { UpcomingRelease } from "./upcoming";

export type Offer = {
  name: string;
  key: string;
  type: "sub" | "free" | "rent" | "buy";
  url: string;
  price?: number | null;
  linkKind?: "guide" | "direct";
};
export type Title = {
  upcomingRelease?: UpcomingRelease;
  id: string;
  name: string;
  year: number | null;
  kind: "movie" | "series";
  genres: string[];
  runtime?: number | null;
  originalLanguage?: string;
  summary: string;
  poster: string | null;
  backdrop?: string | null;
  rating?: number | null;
  voteCount?: number;
  sourceUrl?: string;
  officialUrl?: string | null;
  imdbId?: string | null;
  tvmazeId?: number;
  tmdbId?: number;
  offers: Offer[];
  checked?: string;
  availabilitySource?: string;
  live?: boolean;
  dataSource?: "tmdb" | "watchmode" | "tvmaze";
};
export function sameTitle(a: Title, b: Title) {
  if (a.id === b.id) return true;
  if (a.imdbId && b.imdbId) return a.imdbId === b.imdbId;
  if (a.tmdbId && b.tmdbId) return a.tmdbId === b.tmdbId && a.kind === b.kind;
  return a.kind === b.kind && a.year === b.year && a.name.toLowerCase() === b.name.toLowerCase();
}
export const titles = seed as Title[];
export const services = [
  { key: "netflix", name: "Netflix", short: "N", color: "#ff4d59" },
  { key: "prime", name: "Prime Video", short: "prime", color: "#69caff" },
  { key: "disney", name: "Disney+", short: "Disney+", color: "#8eafff" },
  { key: "apple", name: "Apple TV", short: "tv", color: "#ffffff" },
  { key: "bbc", name: "BBC iPlayer", short: "iP", color: "#ff6da5" },
  { key: "now", name: "NOW", short: "NOW", color: "#61e3b6" },
  { key: "itv", name: "ITVX", short: "itvX", color: "#d3ef4c" },
  { key: "channel4", name: "Channel 4", short: "4", color: "#6de9be" },
  { key: "paramount", name: "Paramount+", short: "P+", color: "#9abaff" },
  { key: "sky", name: "Sky Go", short: "sky", color: "#eaa0e4" },
  { key: "max", name: "HBO Max", short: "HBO", color: "#c1b2ff" },
];
export function serviceKey(name: string) {
  const s = name.trim().toLowerCase();
  if (s === "channel 4" || s === "all 4") return "channel4";
  // Add-on channels must not count as the base Prime or Apple subscription.
  if (/channel|via |\(.*prime/.test(s)) return "addon-" + s.replace(/[^a-z0-9]/g, "");
  if (s.includes("store") || s === "amazon video" || s === "itunes") return "store";
  // These are aliases only for confirmed UK viewing offers, never broadcast-network credits.
  if (/^bbc(?:one|two|1|2)(?:hd)?$/.test(s.replace(/[\s-]+/g, ""))) return "bbc";
  if (s.includes("netflix")) return "netflix";
  if (s.includes("prime")) return "prime";
  if (s.includes("disney")) return "disney";
  if (s.includes("apple")) return "apple";
  if (s.includes("iplayer")) return "bbc";
  if (s.includes("now")) return "now";
  if (s.includes("itv")) return "itv";
  if (s.includes("channel 4") || s === "all 4") return "channel4";
  if (s.includes("paramount")) return "paramount";
  if (s.includes("sky go")) return "sky";
  if (s.includes("hbo") || s === "max") return "max";
  return s.replace(/[^a-z0-9]/g, "");
}
export function safeUrl(url?: string | null): string | undefined {
  if (!url) return;
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return u.href;
  } catch {}
}
export function availabilityUrl(t: Pick<Title, "name" | "availabilitySource">) {
  return (
    safeUrl(t.availabilitySource) || `https://www.justwatch.com/uk/search?q=${encodeURIComponent(t.name)}`
  );
}
export function filterTitles(
  items: Title[],
  f: {
    kind: string;
    genre: string;
    offer: string;
    provider: string;
    mine: boolean;
    selected: string[];
    query?: string;
  },
) {
  return items.filter(
    (t) =>
      (f.kind === "all" || t.kind === f.kind) &&
      (f.genre === "all" || t.genres.includes(f.genre)) &&
      (!f.query || t.name.toLowerCase().includes(f.query.toLowerCase())) &&
      ((f.offer === "all" && f.provider === "all" && !f.mine) ||
        t.offers.some(
          (o) =>
            (f.offer === "all" || o.type === f.offer) &&
            (f.provider === "all" || o.key === f.provider) &&
            (!f.mine || ((o.type === "sub" || o.type === "free") && f.selected.includes(o.key))),
        )),
  );
}

export type TitleExtras = {
  directors?: import("./people").Person[];
  cast: { id: number; name: string; character: string; photo: string | null }[];
  trailer: { name: string; url: string } | null;
  recommendations: Title[];
  message: string | null;
};
