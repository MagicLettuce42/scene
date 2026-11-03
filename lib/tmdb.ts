import { correctedOffers } from "./availability-corrections";
import { personSummary, creditCandidates, type PersonRole, type Filmography } from "./people";
import { datedCredits, isUnreadRelease, type FollowedPerson, type PeopleUpdate } from "./people-following";
import { londonDate } from "./episode-calendar";
import { halloweenDiscoveryTopics, halloweenSelections, isHalloweenRelevant, type HalloweenMood } from "./halloween";
import { selectUpcomingRelease, type UpcomingOptions } from "./upcoming";
import { matchesExtra, noExtraFilters, type ExtraFilters } from "./catalogue-filters";
import type { LibraryEntry } from "./library-state";
import { calendarSeasons, type CalendarData } from "./episode-calendar";
import { serviceKey, safeUrl, filterTitles, type Title, type Offer, type TitleExtras } from "./catalogue";
import { catalogueRefreshRequested, withPublicCatalogueCache } from "./catalogue-edge-cache";

const cache = new Map<string, { at: number; value: any }>();
const retrievedAt = new WeakMap<object, number>();
const pending = new Map<string, Promise<any>>();
let nextRequestAt = 0;
export const hasTMDB = () => Boolean(process.env.TMDB_API_KEY);
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
// Space calls within each worker and deduplicate concurrent lookups. Errors never
// include the upstream URL, which contains the server-only v3 API key.
async function tmdb(path: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ language: "en-GB", ...params });
  const key = path + "?" + query;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < (catalogueRefreshRequested() ? 60000 : 900000)) return hit.value;
  if (pending.has(key)) return pending.get(key);
  let cachedAt = 0;
  const job = withPublicCatalogueCache(path, params, async () => {
    const start = Math.max(Date.now(), nextRequestAt);
    nextRequestAt = start + 120;
    if (start > Date.now()) await pause(start - Date.now());
    query.set("api_key", process.env.TMDB_API_KEY || "");
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await fetch(`https://api.themoviedb.org/3/${path}?${query}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        });
        if (r.status === 429 && attempt === 0) {
          const raw = r.headers.get("Retry-After");
          const delay =
            raw && /^\d+(\.\d+)?$/.test(raw) ? Number(raw) * 1000 : raw ? Date.parse(raw) - Date.now() : 1000;
          if (Number.isFinite(delay) && delay <= 3000) {
            await pause(Math.max(250, delay));
            continue;
          }
        }
        if (!r.ok) throw new Error("Catalogue source unavailable");
        const value = await r.json();
        cachedAt = Date.now();
        return value;
      }
    } catch {
      throw new Error("Catalogue source unavailable");
    }
    throw new Error("Catalogue source unavailable");
  }, at => { cachedAt = at; });
  pending.set(key, job);
  try {
    const value = await job;
    // Warm memory without extending an edge entry's original freshness window.
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    const at = cachedAt || Date.now();
    if (value && typeof value === "object") retrievedAt.set(value, at);
    cache.set(key, { at, value });
    return value;
  } finally {
    pending.delete(key);
  }
}
export function normalizeTMDB(s: any, kind: "movie" | "tv"): Title {
  const uk = s["watch/providers"]?.results?.GB;
  const guide = safeUrl(uk?.link) || `https://www.themoviedb.org/${kind}/${s.id}/watch?locale=GB`;
  const offers: Offer[] = [];
  const seen = new Set<string>();
  for (const [group, type] of [
    ["flatrate", "sub"],
    ["free", "free"],
    ["ads", "free"],
    ["rent", "rent"],
    ["buy", "buy"],
  ] as const) {
    for (const provider of uk?.[group] || []) {
      if (typeof provider.provider_name !== "string") continue;
      const unique = provider.provider_id + ":" + type;
      if (seen.has(unique)) continue;
      seen.add(unique);
      offers.push({
        name: provider.provider_name,
        key: serviceKey(provider.provider_name),
        type,
        url: guide,
        linkKind: "guide",
      });
    }
  }
  const release = kind === "movie" ? s.release_date : s.first_air_date;
  return {
    upcomingRelease: selectUpcomingRelease(s, kind),
    id: `tmdb-${kind}-${s.id}`,
    tmdbId: s.id,
    imdbId: s.imdb_id || s.external_ids?.imdb_id || null,
    name: s.title || s.name,
    year: release ? Number(release.slice(0, 4)) || null : null,
    kind: kind === "movie" ? "movie" : "series",
    genres: (s.genres || []).map((g: any) => g.name),
    runtime:
      kind === "movie"
        ? s.runtime || null
        : s.episode_run_time?.[0] || s.last_episode_to_air?.runtime || null,
    summary: s.overview || "",
    backdrop: typeof s.backdrop_path === "string" && /^\/[a-zA-Z0-9._-]+$/.test(s.backdrop_path) ? `https://image.tmdb.org/t/p/w780${s.backdrop_path}` : null,
    poster:
      typeof s.poster_path === "string" && /^\/[a-zA-Z0-9._-]+$/.test(s.poster_path)
        ? `https://image.tmdb.org/t/p/w500${s.poster_path}`
        : null,
    originalLanguage: typeof s.original_language === "string" ? s.original_language : undefined,
    rating: s.vote_average || null,
    voteCount: Number(s.vote_count) || 0,
    sourceUrl: `https://www.themoviedb.org/${kind}/${s.id}`,
    availabilitySource: guide,
    offers: correctedOffers({ id: `tmdb-${kind}-${s.id}`, tmdbId: s.id, kind: kind === "movie" ? "movie" : "series" }, offers),
    live: true,
    dataSource: "tmdb",
    checked: new Date(retrievedAt.get(s) || Date.now()).toISOString(),
  };
}
export async function tmdbDetails(
  kind: "movie" | "tv",
  id: number,
  format?: "cinema" | "digital",
): Promise<Title> {
  const source = await tmdb(`${kind}/${id}`, {
    append_to_response:
      kind === "movie" ? "watch/providers,external_ids,release_dates" : "watch/providers,external_ids",
  });
  const title = normalizeTMDB(source, kind);
  if (format) title.upcomingRelease = selectUpcomingRelease(source, kind, undefined, undefined, format);
  return title;
}
export async function upcomingTMDB(options: UpcomingOptions) {
  const { kind, format, from, to, page } = options;
  const params: Record<string, string> = {
    page: String(page),
    include_adult: "false",
    sort_by: "popularity.desc",
  };
  if (kind === "movie")
    Object.assign(params, {
      region: "GB",
      include_video: "false",
      "release_date.gte": from,
      "release_date.lte": to,
      with_release_type: format === "cinema" ? "2|3" : format === "digital" ? "4" : "2|3|4",
    });
  else
    Object.assign(params, {
      "first_air_date.gte": from,
      "first_air_date.lte": to,
      include_null_first_air_dates: "false",
    });
  const data = await tmdb(`discover/${kind}`, params);
  const rows = (data.results || [])
    .filter((r: any) => !r.adult && Number.isSafeInteger(r.id) && r.id > 0)
    .slice(0, 20);
  const titles: Title[] = [];
  let failed = 0;
  for (let i = 0; i < rows.length; i += 4) {
    const batch = await Promise.allSettled(
      rows.slice(i, i + 4).map(async (r: any) => {
        const source = await tmdb(`${kind}/${r.id}`, {
          append_to_response:
            kind === "movie" ? "watch/providers,external_ids,release_dates" : "watch/providers,external_ids",
        });
        if (source.adult) return null;
        const release = selectUpcomingRelease(source, kind, from, to, format);
        return release ? { ...normalizeTMDB(source, kind), upcomingRelease: release } : null;
      }),
    );
    for (const result of batch)
      if (result.status === "rejected") failed++;
      else if (result.value && !titles.some((t) => t.id === result.value!.id)) titles.push(result.value);
  }
  if (rows.length && failed === rows.length) throw Error("Release details unavailable");
  const totalPages = Math.min(Math.max(Number(data.total_pages) || 0, 0), 500);
  return {
    titles,
    page,
    totalPages,
    hasMore: page < totalPages,
    from,
    to,
    source: "tmdb",
    message: failed ? "Some release details could not load. Retry this page to check them." : null,
  };
}
// TMDB's movie/TV genre identifiers are shared by search and genre-list responses.
// Search summaries carry IDs rather than names; keep filters usable without a
// separate metadata request for each title.
const searchGenreNames: Record<number, string> = {
  12: "Adventure", 14: "Fantasy", 16: "Animation", 18: "Drama", 27: "Horror",
  28: "Action", 35: "Comedy", 36: "History", 37: "Western", 53: "Thriller",
  80: "Crime", 99: "Documentary", 878: "Science Fiction", 9648: "Mystery",
  10402: "Music", 10749: "Romance", 10751: "Family", 10752: "War", 10770: "TV Movie",
  10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
};
export async function searchTMDB(q: string, page = 1) {
  const data = await tmdb("search/multi", { query: q, include_adult: "false", page: String(page) });
  const rows = (data.results || [])
    .filter((x: any) => ["movie", "tv"].includes(x.media_type) && !x.adult && Number.isSafeInteger(x.id) && x.id > 0)
    .slice(0, 20);
  const out: Title[] = rows.map((row: any) => {
    const append = row.media_type === "movie" ? "watch/providers,external_ids,release_dates" : "watch/providers,external_ids";
    const key = `${row.media_type}/${row.id}?` + new URLSearchParams({ language: "en-GB", append_to_response: append });
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < (catalogueRefreshRequested() ? 60000 : 900000)) return normalizeTMDB(hit.value, row.media_type);
    // Availability has not been checked by a search response. Opening the title
    // already loads full details and offers through the existing title endpoint.
    return { ...normalizeTMDB({ ...row, genres: (row.genre_ids || [])
      .filter((id: number) => searchGenreNames[id]).map((id: number) => ({ name: searchGenreNames[id] })) }, row.media_type), checked: undefined };
  });
  const people = page === 1 ? (data.results || []).filter((row: any) => row.media_type === "person").map(personSummary).filter(Boolean) : [];
  return {
    titles: out,
    page,
    hasMore: page < Math.min(Number(data.total_pages) || 0, 500),
    mode: "live",
    source: "tmdb",
    message: null,
    people,
    peopleHasMore: people.length > 0 && Number(data.total_pages) > 1,
    peopleMessage: null,
  };
}
export type BrowseOptions = {
  kind: "movie" | "tv";
  page: number;
  provider: string;
  selected: string[];
  mine: boolean;
  offer: string;
  genre: string;
  sort: string;
  limit?: number;
  minDate?: string;
  maxRuntime?: number;
  extra?: ExtraFilters;
  // Server-selected editorial constraints, applied alongside user filters.
  keywords?: number[];
  requiredGenre?: string;
};
export async function browseTMDB(options: BrowseOptions) {
  const { kind, page, provider, selected, mine, offer, genre, sort } = options;
  const genreData = await tmdb(`genre/${kind}/list`);
  const genres = (genreData.genres || []).map((g: any) => String(g.name)).sort();
  const empty = () => ({
    titles: [] as Title[],
    page,
    totalPages: 0,
    hasMore: false,
    capped: false,
    genres,
    source: "tmdb",
    message: null as string | null,
  });
  const params: Record<string, string> = {
    page: String(page),
    include_adult: "false",
    watch_region: "GB",
    sort_by:
      sort === "az"
        ? kind === "movie"
          ? "title.asc"
          : "name.asc"
        : sort === "newest"
          ? kind === "movie"
            ? "primary_release_date.desc"
            : "first_air_date.desc"
          : sort === "rating"
            ? "vote_average.desc"
            : "popularity.desc",
  };
  if (kind === "movie") params.include_video = "false";
  if (sort === "rating") params["vote_count.gte"] = "200";
  if (options.maxRuntime) {
    params["with_runtime.gte"] = "1";
    params["with_runtime.lte"] = String(options.maxRuntime);
  }
  if (options.minDate)
    params[kind === "movie" ? "primary_release_date.gte" : "first_air_date.gte"] = options.minDate;
  if (sort === "newest")
    params[kind === "movie" ? "primary_release_date.lte" : "first_air_date.lte"] = new Date()
      .toISOString()
      .slice(0, 10);
  const extra = options.extra || noExtraFilters();
  if (extra.runtimeMax && kind === "movie") {
    params["with_runtime.gte"] = "1";
    params["with_runtime.lte"] = String(Math.min(extra.runtimeMax, options.maxRuntime || 600));
  }
  const dateField = kind === "movie" ? "primary_release_date" : "first_air_date";
  if (extra.yearFrom) {
    const date = String(extra.yearFrom) + "-01-01";
    params[dateField + ".gte"] = [params[dateField + ".gte"] || "", date].sort().pop()!;
  }
  if (extra.yearTo) {
    const date = String(extra.yearTo) + "-12-31";
    params[dateField + ".lte"] = [params[dateField + ".lte"] || date, date].sort()[0];
  }
  if (extra.minRating) {
    params["vote_average.gte"] = String(extra.minRating);
    params["vote_count.gte"] = String(Math.max(Number(params["vote_count.gte"]) || 0, 50));
  }
  if (extra.language) params.with_original_language = extra.language;
  if (genre !== "all") {
    const g = (genreData.genres || []).find((g: any) => g.name === genre);
    if (!g) return empty();
    params.with_genres = String(g.id);
  }
  if (options.requiredGenre) {
    const required = (genreData.genres || []).find((g: any) => g.name === options.requiredGenre);
    if (!required) return empty();
    params.with_genres = [...new Set([params.with_genres, String(required.id)].filter(Boolean))].join(",");
  }
  if (options.keywords?.length) params.with_keywords = options.keywords.join("|");
  if (
    mine &&
    (!selected.length ||
      ["rent", "buy"].includes(offer) ||
      (provider !== "all" && !selected.includes(provider)))
  )
    return empty();
  const wanted = provider !== "all" ? [provider] : mine ? selected : [];
  if (wanted.length) {
    const providers = await tmdb(`watch/providers/${kind}`, { watch_region: "GB" });
    const ids = (providers.results || [])
      .filter((p: any) => wanted.includes(serviceKey(p.provider_name)))
      .map((p: any) => String(p.provider_id));
    if (!ids.length) return empty();
    params.with_watch_providers = [...new Set(ids)].join("|");
  }
  const monetization =
    offer === "sub"
      ? "flatrate"
      : offer === "free"
        ? "free|ads"
        : offer === "rent"
          ? "rent"
          : offer === "buy"
            ? "buy"
            : mine
              ? "flatrate|free|ads"
              : null;
  if (monetization) params.with_watch_monetization_types = monetization;
  const data = await tmdb(`discover/${kind}`, params);
  const rows = (data.results || []).filter((r: any) => !r.adult).slice(0, options.limit || 20);
  const out: Title[] = [];
  let failed = 0;
  for (let i = 0; i < rows.length; i += 4) {
    const batch = await Promise.allSettled(rows.slice(i, i + 4).map((r: any) => tmdbDetails(kind, r.id)));
    for (const item of batch) {
      if (item.status === "fulfilled") out.push(item.value);
      else failed++;
    }
  }
  if (failed && out.length === 0) throw new Error("Catalogue details unavailable");
  // Recheck each offer so a rental on a selected service cannot match a
  // subscription on a different service returned by the upstream discovery API.
  const filtered = filterTitles(out, {
    kind: kind === "movie" ? "movie" : "series",
    provider,
    selected,
    mine,
    offer,
    genre,
  }).filter((t) => matchesExtra(t, extra) && (!options.requiredGenre || t.genres.includes(options.requiredGenre)));
  const totalPages = Math.min(Number(data.total_pages) || 0, 500);
  return {
    titles: filtered,
    page,
    totalPages,
    hasMore: page < totalPages,
    capped: Number(data.total_pages) > 500 && page >= 500,
    genres,
    source: "tmdb",
    message: failed ? "Some titles could not be loaded. Retry this page or continue browsing." : null,
  };
}
export type TitleHint = Pick<Title, "name" | "year" | "kind"> & { imdbId?: string | null };
export function normalizedTitleName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}
export function exactTitleMatch(rows: any[], hint: TitleHint) {
  const name = normalizedTitleName(hint.name),
    matches = rows.filter(
      (x) =>
        !x.adult &&
        [x.title, x.name, x.original_title, x.original_name].some(
          (n) => typeof n === "string" && normalizedTitleName(n) === name,
        ) &&
        (!hint.year || Number((x.release_date || x.first_air_date || "").slice(0, 4)) === hint.year),
    );
  return matches.length === 1 ? matches[0] : undefined;
}
export async function resolveTMDB(hint: TitleHint): Promise<Title> {
  const kind = hint.kind === "movie" ? "movie" : "tv";
  let match: any;
  if (hint.imdbId) {
    const r = await tmdb(`find/${hint.imdbId}`, { external_source: "imdb_id" });
    match = (r[kind === "movie" ? "movie_results" : "tv_results"] || [])[0];
  } else {
    const r = await tmdb(`search/${kind}`, {
      query: hint.name,
      include_adult: "false",
      ...(hint.year ? { [kind === "movie" ? "year" : "first_air_date_year"]: String(hint.year) } : {}),
    });
    match = exactTitleMatch(r.results || [], hint);
    if (!match && /[’‘–—]/.test(hint.name)) {
      const retry = await tmdb(`search/${kind}`, {
        query: hint.name.replace(/[’‘]/g, "'").replace(/[–—]/g, "-"),
        include_adult: "false",
        ...(hint.year ? { [kind === "movie" ? "year" : "first_air_date_year"]: String(hint.year) } : {}),
      });
      match = exactTitleMatch(retry.results || [], hint);
    }
  }
  if (!match) throw new Error("No matching title");
  return tmdbDetails(kind, match.id);
}

export async function halloweenTMDB(
  mood: HalloweenMood,
  selected: string[],
  offer: string,
  genre = "all",
  extra = noExtraFilters(),
  page = 0,
) {
  if (page > 0) {
    // Resolve exact topic names, rather than guessing keyword IDs. These public
    // metadata lookups share tmdb()'s cache across requests and categories.
    const topics = halloweenDiscoveryTopics(mood);
    const resolved = await Promise.allSettled(topics.map(async (topic) => {
      const data = await tmdb("search/keyword", { query: topic });
      return (data.results || []).find((keyword: any) =>
        typeof keyword.name === "string" && keyword.name.toLowerCase() === topic &&
        Number.isSafeInteger(keyword.id) && keyword.id > 0,
      )?.id as number | undefined;
    }));
    const keywords = resolved.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
    if (!keywords.length) throw Error("Halloween topics unavailable");
    const data = await browseTMDB({
      kind: "movie", page, provider: "all", selected, mine: true, offer, genre,
      sort: "recommended", extra, keywords,
      requiredGenre: mood === "family" ? "Family" : mood === "horror" ? "Horror" : undefined,
    });
    return {
      ...data,
      titles: data.titles.filter(isHalloweenRelevant),
      message: data.message || (resolved.some((result) => result.status === "rejected")
        ? "Some Halloween topics are temporarily unavailable." : null),
    };
  }
  const hints = halloweenSelections(mood),
    titles: Title[] = [];
  let failed = 0;
  for (let i = 0; i < hints.length; i += 4) {
    const batch = await Promise.allSettled(hints.slice(i, i + 4).map(async (pick) => {
      const kind = pick.kind === "movie" ? "movie" : "tv";
      // Editorial picks already identify a record. Searching its display name can
      // miss aliases or reject duplicates, and doubles upstream requests.
      for (let attempt = 0; ; attempt++) {
        try {
          const title = await tmdbDetails(kind, pick.tmdbId);
          if (title.tmdbId !== pick.tmdbId || title.year !== pick.year)
            throw Error("Halloween catalogue record mismatch");
          return title;
        } catch {
          if (attempt === 0) continue; // Failed requests are not cached by tmdb().
          console.warn("Halloween pick unavailable", { kind, tmdbId: pick.tmdbId });
          throw Error("Halloween pick unavailable");
        }
      }
    }));
    for (const result of batch) {
      if (result.status === "fulfilled") titles.push(result.value);
      else failed++;
    }
  }
  if (!titles.length && failed) throw Error("Halloween picks unavailable");
  return {
    page: 0,
    hasMore: true,
    titles: filterTitles(titles, {
      kind: "all",
      provider: "all",
      mine: true,
      selected,
      offer,
      genre,
    }).filter((title) => matchesExtra(title, extra)),
    genres: [...new Set(titles.flatMap((title) => title.genres))].sort(),
    message: failed ? "Some Halloween picks are temporarily unavailable." : null,
  };
}

export const discoverSections = ["popular", "rated", "recent", "short"] as const;
export async function discoverTMDB(
  section: (typeof discoverSections)[number],
  selected: string[],
  offer: string,
  genre = "all",
  extra = noExtraFilters(),
) {
  const defaults: BrowseOptions = {
    kind: "movie",
    page: 1,
    provider: "all",
    selected,
    mine: true,
    offer,
    genre,
    extra,
    sort: "recommended",
    limit: 10,
  };
  if (section === "popular") {
    const both = await Promise.allSettled([
      browseTMDB({ ...defaults, limit: 6 }),
      browseTMDB({ ...defaults, kind: "tv", limit: 6 }),
    ]);
    const ok = both.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof browseTMDB>>> => r.status === "fulfilled",
    );
    if (!ok.length) throw Error("Discover unavailable");
    const films = ok[0]?.value.titles || [],
      series = ok[1]?.value.titles || [];
    const titles: Title[] = [];
    for (let i = 0; i < Math.max(films.length, series.length); i++) {
      if (films[i]) titles.push(films[i]);
      if (series[i]) titles.push(series[i]);
    }
    return {
      titles,
      genres: [...new Set(ok.flatMap((r) => r.value.genres))].sort(),
      message:
        ok.length < 2
          ? "Some popular titles could not load."
          : ok.map((r) => r.value.message).find(Boolean) || null,
    };
  }
  const since = new Date();
  since.setUTCFullYear(since.getUTCFullYear() - 1);
  const result = await browseTMDB({
    ...defaults,
    ...(section === "rated"
      ? { sort: "rating" }
      : section === "recent"
        ? { sort: "newest", minDate: since.toISOString().slice(0, 10) }
        : { maxRuntime: 100 }),
  });
  // Discovery runtime/rating indexes can lag behind the full title record.
  // Check the hydrated metadata before making a promise in a section label.
  const eligible = result.titles.filter((t) =>
    section === "short"
      ? typeof t.runtime === "number" && t.runtime > 0 && t.runtime <= 100
      : section === "rated"
        ? (t.voteCount || 0) >= 200
        : true,
  );
  return { titles: eligible, genres: result.genres, message: result.message };
}
export function normalizeExtras(data: any): Pick<TitleExtras, "cast" | "trailer" | "directors"> {
  const cast = (data.credits?.cast || [])
    .filter((p: any) => typeof p.name === "string" && Number.isSafeInteger(p.id) && p.id > 0)
    .slice(0, 8)
    .map((p: any) => ({
      id: Number(p.id),
      name: p.name,
      character: typeof p.character === "string" ? p.character : "",
      photo:
        typeof p.profile_path === "string" && /^\/[a-zA-Z0-9._-]+$/.test(p.profile_path)
          ? `https://image.tmdb.org/t/p/w185${p.profile_path}`
          : null,
    }));
  const videos = (data.videos?.results || [])
    .filter(
      (v: any) =>
        v.type === "Trailer" &&
        ((v.site === "YouTube" && /^[A-Za-z0-9_-]{11}$/.test(v.key)) ||
          (v.site === "Vimeo" && /^\d+$/.test(v.key))),
    )
    .sort((a: any, b: any) => Number(Boolean(b.official)) - Number(Boolean(a.official)));
  const directors = (data.credits?.crew || [])
    .filter((p: any) => p.job === "Director")
    .map(personSummary)
    .filter(Boolean)
    .filter((p: any, i: number, all: any[]) => all.findIndex((x) => x.id === p.id) === i)
    .slice(0, 8);
  const v = videos[0];
  return {
    cast,
    directors,
    trailer: v
      ? {
          name: v.name || "Watch trailer",
          url:
            v.site === "YouTube" ? `https://www.youtube.com/watch?v=${v.key}` : `https://vimeo.com/${v.key}`,
        }
      : null,
  };
}
export async function extrasTMDB(
  kind: "movie" | "tv",
  id: number,
  selected: string[],
  offer: string,
): Promise<TitleExtras> {
  const data = await tmdb(`${kind}/${id}`, { append_to_response: "videos,credits,recommendations" });
  const rows = (data.recommendations?.results || []).filter((r: any) => !r.adult && r.id !== id).slice(0, 12);
  const titles: Title[] = [];
  let failed = false;
  for (let i = 0; i < rows.length; i += 4) {
    const batch = await Promise.allSettled(rows.slice(i, i + 4).map((r: any) => tmdbDetails(kind, r.id)));
    for (const r of batch) {
      if (r.status === "fulfilled") titles.push(r.value);
      else failed = true;
    }
  }
  return {
    ...normalizeExtras(data),
    recommendations: filterTitles(titles, {
      kind: "all",
      genre: "all",
      offer,
      provider: "all",
      mine: true,
      selected,
    }),
    message: failed ? "Some similar titles could not load." : null,
  };
}

export async function seriesEpisodesTMDB(id: number, season?: number) {
  const { normalizeSeasons, normalizeEpisodes } = await import("./episodes");
  const catalogue = normalizeSeasons(await tmdb(`tv/${id}`));
  if (season === undefined) return catalogue;
  if (!catalogue.seasons.some((s) => s.number === season)) throw Error("That season is not listed.");
  return { ...catalogue, season, episodes: normalizeEpisodes(await tmdb(`tv/${id}/season/${season}`)) };
}

export async function personalRecommendationsTMDB(
  seeds: LibraryEntry[],
  selected: string[],
  offer: string,
  genre: string,
  extra: ExtraFilters,
  mode: "balanced" | "familiar" | "adventurous" = "balanced",
) {
  const groups: { seed: LibraryEntry; titles: Title[] }[] = [];
  let failed = false;
  // More varied seeds, with a fixed hydration budget to control API usage.
  const rows = await Promise.allSettled(
    seeds.slice(0, mode === "familiar" ? 4 : 8).map(async (seed) => ({
      seed,
      data: await tmdb(
        `${seed.title.kind === "movie" ? "movie" : "tv"}/${seed.title.tmdbId}/${mode === "familiar" ? "similar" : "recommendations"}`,
      ),
    })),
  );
  const candidates: { seed: LibraryEntry; ids: number[] }[] = [];
  for (const row of rows) {
    if (row.status === "rejected") {
      failed = true;
      continue;
    }
    candidates.push({
      seed: row.value.seed,
      ids: (row.value.data.results || [])
        .filter((t: any) => !t.adult && Number.isSafeInteger(t.id) && t.id > 0)
        .slice(mode === "adventurous" ? 3 : 0, mode === "adventurous" ? 15 : 12)
        .map((t: any) => t.id),
    });
  }
  if (!candidates.length) throw Error("Recommendations unavailable");
  const hydrated = new Map<string, Title>(),
    queued = new Set<string>(),
    jobs: { kind: "movie" | "tv"; id: number; key: string }[] = [];
  for (let i = 0; i < 12 && jobs.length < 24; i++)
    for (const c of candidates) {
      const id = c.ids[i],
        kind = c.seed.title.kind === "movie" ? "movie" : "tv",
        key = kind + "-" + id;
      if (!id || queued.has(key) || jobs.length >= 24) continue;
      queued.add(key);
      jobs.push({ kind, id, key });
    }
  for (let i = 0; i < jobs.length; i += 4) {
    const batch = await Promise.allSettled(
      jobs.slice(i, i + 4).map(async (job) => ({ key: job.key, title: await tmdbDetails(job.kind, job.id) })),
    );
    for (const row of batch) {
      if (row.status === "fulfilled") hydrated.set(row.value.key, row.value.title);
      else failed = true;
    }
  }
  if (jobs.length && !hydrated.size) throw Error("Recommendations unavailable");

  for (const c of candidates) {
    const kind = c.seed.title.kind === "movie" ? "movie" : "tv";
    const titles = c.ids.map((id) => hydrated.get(kind + "-" + id)).filter((t): t is Title => !!t);
    groups.push({
      seed: c.seed,
      titles: filterTitles(titles, {
        kind: "all",
        genre,
        offer,
        provider: "all",
        mine: true,
        selected,
      }).filter((t) => matchesExtra(t, extra)),
    });
  }
  return { groups, message: failed ? "Some suggestions could not load. You can retry this section." : null };
}
export async function episodeCalendarTMDB(id: number, from: string, to: string): Promise<CalendarData> {
  const { normalizeSeasons, normalizeEpisodes } = await import("./episodes");
  const catalogue = normalizeSeasons(await tmdb(`tv/${id}`)),
    selected = calendarSeasons(catalogue.seasons, from, to);
  const rows = await Promise.allSettled(
    selected.seasons.map(async (season) => ({
      season: season.number,
      episodes: normalizeEpisodes(await tmdb(`tv/${id}/season/${season.number}`)),
    })),
  );
  if (rows.length && rows.every((r) => r.status === "rejected")) throw Error("Calendar unavailable");
  return {
    episodes: rows
      .flatMap((r) =>
        r.status === "fulfilled"
          ? r.value.episodes
              .filter((e) => e.airDate && e.airDate >= from && e.airDate <= to)
              .map((e) => ({ ...e, season: r.value.season }))
          : [],
      )
      .sort((a, b) => a.airDate!.localeCompare(b.airDate!) || a.season - b.season || a.number - b.number),
    partial: selected.partial || rows.some((r) => r.status === "rejected"),
  };
}

export async function searchPeopleTMDB(query: string, page: number) {
  const data = await tmdb("search/person", { query, page: String(page), include_adult: "false" });
  return {
    people: (data.results || []).map(personSummary).filter(Boolean),
    page,
    hasMore: page < Math.min(Number(data.total_pages) || 0, 100),
  };
}
export async function followedPeopleTMDB(follows: FollowedPerson[], hidden: string[], view: "upcoming"|"recent", page: number, personId?: number) {
  const today=londonDate(),groups=new Map<string,PeopleUpdate>(),failedPeople:string[]=[];
  const results=await Promise.allSettled(follows.map(async follow=>{
    const source=await tmdb(`person/${follow.person.id}`,{append_to_response:"combined_credits"});
    const person=personSummary(source);if(!person||person.id!==follow.person.id)throw Error("Person unavailable");
    return {follow,person,credits:datedCredits(source.combined_credits,follow,today)};
  }));
  results.forEach((result,index)=>{
    if(result.status==="rejected"){failedPeople.push(follows[index].person.name);return;}
    const {follow,person,credits}=result.value;
    for(const {row,date,role} of credits){
      const title=normalizeTMDB(row,row.media_type);if(hidden.includes(title.id))continue;
      const reason={id:person.id,name:person.name,role},old=groups.get(title.id);
      if(old){old.people.push(reason);old.unread ||= isUnreadRelease(date,follow,today);}
      else groups.set(title.id,{title,date,people:[reason],unread:isUnreadRelease(date,follow,today)});
    }
  });
  if(follows.length&&failedPeople.length===follows.length)throw Error("Following updates unavailable");
  const all=[...groups.values()],unread=all.filter(u=>u.unread).length;
  const rows=all.filter(u=>(view==="upcoming"?u.date>today:u.date<=today)&&(!personId||u.people.some(p=>p.id===personId)))
    .sort((a,b)=>(view==="upcoming"?a.date.localeCompare(b.date):b.date.localeCompare(a.date))||a.title.name.localeCompare(b.title.name));
  return {updates:rows.slice((page-1)*12,page*12),page,hasMore:page*12<rows.length,unread,failedPeople,checkedPeople:results.flatMap(r=>r.status==="fulfilled"?[r.value.person.id]:[]),checkedAt:new Date().toISOString(),total:rows.length};
}
export async function personFilmographyTMDB(
  id: number,
  selected: string[],
  role: PersonRole,
  page: number,
): Promise<Filmography> {
  const data = await tmdb(`person/${id}`, { append_to_response: "combined_credits" }),
    person = personSummary(data);
  if (!person) throw Error("Person unavailable");
  if (!selected.length) return { person, titles: [], page, hasMore: false, message: null };
  const candidates = creditCandidates(data.combined_credits || {}, role),
    rows = candidates.slice((page - 1) * 20, page * 20),
    titles: Title[] = [];
  let failed = 0;
  for (let i = 0; i < rows.length; i += 4) {
    const batch = await Promise.allSettled(
      rows.slice(i, i + 4).map((r: any) => tmdbDetails(r.media_type, r.id)),
    );
    for (const r of batch)
      if (r.status === "fulfilled") titles.push(r.value);
      else failed++;
  }
  if (rows.length && failed === rows.length) throw Error("Viewing options unavailable");
  return {
    person,
    titles: filterTitles(titles, {
      kind: "all",
      genre: "all",
      offer: "all",
      provider: "all",
      mine: true,
      selected,
    }),
    page,
    hasMore: page < 100 && page * 20 < candidates.length,
    message: failed ? "Some viewing options could not load. Retry to check them." : null,
  };
}
