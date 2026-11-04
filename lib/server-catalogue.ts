import { serviceArrivalTitle } from "./service-arrivals";
import { titles, serviceKey, safeUrl, type Title, type Offer } from "./catalogue";
import { hasTMDB, searchTMDB, tmdbDetails, resolveTMDB, type TitleHint, type SearchOptions } from "./tmdb";
const cache = new Map<string, { at: number; value: any }>();
async function json(url: string, headers: Record<string, string> = {}) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < 900000) return hit.value;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json", "User-Agent": "SceneDiscovery/1.0", ...headers },
  });
  if (!r.ok) throw new Error("Catalogue source unavailable");
  const value = await r.json();
  if (cache.size > 80) cache.delete(cache.keys().next().value!);
  cache.set(url, { at: Date.now(), value });
  return value;
}
export const hasDirectLinks = () => Boolean(process.env.WATCHMODE_API_KEY);
export const catalogueSource = () => (hasTMDB() ? "tmdb" : hasDirectLinks() ? "watchmode" : "tvmaze");
export const hasLiveFeed = () => hasTMDB() || hasDirectLinks();
async function wm(path: string, params: Record<string, string> = {}) {
  const p = new URLSearchParams(params);
  return json(`https://api.watchmode.com/v1/${path}/?${p}`, {
    "X-API-Key": process.env.WATCHMODE_API_KEY || "",
  });
}
export function normalizeTV(s: any): Title {
  const existing = titles.find((t) => t.id === `tv-${s.id}`);
  return {
    ...existing,
    id: `tv-${s.id}`,
    tvmazeId: s.id,
    name: existing?.name || s.name,
    year: s.premiered ? Number(s.premiered.slice(0, 4)) : null,
    kind: "series",
    genres: s.genres || [],
    runtime: s.averageRuntime || s.runtime || null,
    summary: (s.summary || "")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'"),
    poster: existing?.poster || safeUrl(s.image?.medium) || null,
    rating: s.rating?.average || null,
    sourceUrl: safeUrl(s.url),
    officialUrl: safeUrl(s.officialSite),
    imdbId: s.externals?.imdb,
    offers: existing?.offers || [],
  };
}
export function normalizeWM(s: any): Title {
  const offers: Offer[] = (s.sources || [])
    .filter(
      (o: any) =>
        o.region === "GB" &&
        ["sub", "free", "rent", "buy", "tve"].includes(o.type) &&
        typeof o.name === "string" &&
        safeUrl(o.web_url),
    )
    .map((o: any) => ({
      name: o.name,
      key: serviceKey(o.name),
      type: o.type === "tve" ? "sub" : o.type,
      url: safeUrl(o.web_url)!,
      price: o.price,
    }));
  const seen = new Set<string>();
  return {
    id: `wm-${s.id}`,
    name: s.title,
    year: s.year || null,
    kind: ["movie", "tv_movie", "short_film"].includes(s.type) ? "movie" : "series",
    genres: s.genre_names || [],
    runtime: s.runtime_minutes || null,
    summary: s.plot_overview || "",
    poster: safeUrl(s.poster) || null,
    rating: null,
    imdbId: s.imdb_id,
    offers: offers.filter((o) => {
      const k = o.name + o.type + o.url;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
    checked: new Date().toISOString(),
    live: true,
    dataSource: "watchmode",
  };
}
export async function searchCatalogue(q: string, page = 1, options: SearchOptions = {}) {
  const local = titles.filter((t) => t.name.toLowerCase().includes(q.toLowerCase()));
  if (options.preview && !hasTMDB()) return { titles: local, page, hasMore: false, mode: "limited", message: null };
  if (hasTMDB()) {
    try {
      return await searchTMDB(q, page, options);
    } catch {
      if (options.signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
      if (page > 1) throw Error("More search results could not load.");
      return {
        titles: local,
        mode: "limited",
        source: "tmdb",
        message:
          "TMDB is temporarily unavailable. Showing matching saved picks. Try again shortly or check JustWatch UK.",
      };
    }
  }
  if (page > 1) return { titles: [], page, hasMore: false, message: null, mode: "limited" };
  if (hasDirectLinks()) {
    try {
      const r = await wm("search", { search_field: "name", search_value: q, types: "movie,tv" });
      const ids = (r.title_results || [])
        .filter((x: any) =>
          ["movie", "tv_movie", "short_film", "tv_series", "tv_miniseries", "tv_special"].includes(x.type),
        )
        .slice(0, 12);
      const out: Title[] = [];
      let failed = 0;
      for (let i = 0; i < ids.length; i += 4) {
        const batch = await Promise.allSettled(
          ids
            .slice(i, i + 4)
            .map((x: any) => wm(`title/${x.id}/details`, { append_to_response: "sources", regions: "GB" })),
        );
        for (const x of batch) {
          if (x.status === "fulfilled") out.push(normalizeWM(x.value));
          else failed++;
        }
      }
      if (failed && out.length === 0) throw new Error("Catalogue details unavailable");
      return {
        titles: out,
        mode: "live",
        message: failed ? "Some title details could not be loaded. Try again shortly." : null,
      };
    } catch {
      return {
        titles: local,
        mode: "limited",
        message:
          "The live listings feed is unavailable. Showing matching saved picks; you can also check JustWatch UK.",
      };
    }
  }
  try {
    const rows = await json(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
    const all = [...local, ...rows.slice(0, 24).map((x: any) => normalizeTV(x.show))];
    const seen = new Set<string>();
    return {
      titles: all.filter((t) => {
        if (seen.has(t.id)) return false;
        seen.add(t.id);
        return true;
      }),
      mode: "limited",
      message: null,
    };
  } catch {
    return {
      titles: local,
      mode: "limited",
      message: "TV search is temporarily unavailable. Showing matching saved picks.",
    };
  }
}
export async function getTitle(id: string, hint?: TitleHint): Promise<Title | null> {
  if (id.startsWith("arrival-")) return serviceArrivalTitle(id);
  const seed = titles.find((t) => t.id === id);
  if (hasTMDB()) {
    const match = id.match(/^tmdb-(movie|tv)-(\d+)$/);
    if (match) return tmdbDetails(match[1] as "movie" | "tv", Number(match[2]));
    let original: TitleHint | undefined = seed || hint;
    if (!original && /^tv-\d+$/.test(id))
      original = normalizeTV(await json(`https://api.tvmaze.com/shows/${id.slice(3)}`));
    if (!original) return null;
    const fresh = await resolveTMDB(original);
    return { ...fresh, id, poster: seed?.poster || fresh.poster };
  }
  if (/^wm-\d+$/.test(id) && hasDirectLinks())
    return normalizeWM(
      await wm(`title/${id.slice(3)}/details`, { append_to_response: "sources", regions: "GB" }),
    );
  if (seed && hasDirectLinks()) return refreshFromWatchmode(seed);
  if (/^tv-\d+$/.test(id)) {
    const tv = normalizeTV(await json(`https://api.tvmaze.com/shows/${id.slice(3)}`));
    if (hasDirectLinks()) return refreshFromWatchmode(tv);
    return tv;
  }
  return seed || null;
}
// Only called by the explicit direct-links action; ordinary TMDB lookups never
// fall through to Watchmode, including during a TMDB outage.
export async function getDirectOffers(id: string, hint?: TitleHint) {
  if (!hasDirectLinks()) throw new Error("Direct links unavailable");
  const title = await getTitle(id, hint);
  if (!title) throw new Error("Title not found");
  const direct = title.dataSource === "watchmode" ? title : await refreshFromWatchmode(title);
  return { offers: direct.offers, checked: direct.checked, source: "watchmode" };
}
async function refreshFromWatchmode(title: Title): Promise<Title> {
  const r = await wm("search", {
    search_field: title.imdbId ? "imdb_id" : "name",
    search_value: title.imdbId || title.name,
  });
  const match = (r.title_results || []).find((x: any) =>
    title.imdbId
      ? x.imdb_id === title.imdbId
      : x.name.toLowerCase() === title.name.toLowerCase() &&
        x.year === title.year &&
        (["movie", "tv_movie", "short_film"].includes(x.type) ? "movie" : "series") === title.kind,
  );
  if (!match) throw new Error("No matching live title");
  const fresh = normalizeWM(
    await wm(`title/${match.id}/details`, { append_to_response: "sources", regions: "GB" }),
  );
  return { ...fresh, id: title.id, poster: title.poster || fresh.poster };
}
