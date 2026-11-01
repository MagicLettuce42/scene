import { services, type Title } from "./catalogue";
import { addDays, londonDate } from "./episode-calendar";
import {
  announcementsReviewedOn,
  serviceAnnouncements,
  type ServiceAnnouncement,
} from "./service-announcements";
import { hasTMDB, resolveTMDB, tmdbDetails } from "./tmdb";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readReleaseFeed, type FeedAnnouncement } from "./release-feed";
export type ArrivalOptions = {
  kind: "all" | "movie" | "tv";
  provider: string;
  selected: string[];
  from: string;
  to: string;
};
export function parseArrivalQuery(params: URLSearchParams, now = new Date()): ArrivalOptions | null {
  const days = params.get("days") || "30",
    kind = params.get("kind") || "all",
    provider = params.get("provider") || "mine",
    raw = params.get("services") || "";
  const selected = [...new Set(raw.split(",").filter(Boolean))],
    known = (key: string) => services.some((s) => s.key === key);
  if (
    !["7", "30", "90"].includes(days) ||
    !["all", "movie", "tv"].includes(kind) ||
    (!["mine", "all"].includes(provider) && !known(provider)) ||
    raw.length > 200 ||
    selected.length > services.length ||
    selected.some((s) => !known(s))
  )
    return null;
  const from = londonDate(now);
  return {
    kind: kind as ArrivalOptions["kind"],
    provider,
    selected,
    from,
    to: addDays(from, Number(days) - 1),
  };
}
export function matchingAnnouncements(
  options: ArrivalOptions,
  entries: FeedAnnouncement[] = serviceAnnouncements,
) {
  return entries
    .filter(
      (a) =>
        a.date >= options.from &&
        a.date <= options.to &&
        (options.kind === "all" || a.kind === (options.kind === "tv" ? "series" : "movie")) &&
        (options.provider === "all" || options.provider === "mine"
          ? options.provider === "all" || options.selected.includes(a.service)
          : options.provider === a.service),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
export async function announcementTitle(entry: FeedAnnouncement): Promise<Title> {
  const provider = services.find((s) => s.key === entry.service)!;
  const basic: Title = {
    id: "arrival-" + entry.id,
    name: entry.name,
    year: entry.year,
    kind: entry.kind,
    genres: [],
    summary: `${entry.label}, announced for ${provider.name} in the UK. See the provider announcement for details.`,
    poster: entry.poster || null,
    offers: [],
    sourceUrl: entry.sourceUrl,
  };
  let title = basic;
  if (hasTMDB())
    try {
      title = entry.tmdbId
        ? await tmdbDetails(entry.kind === "movie" ? "movie" : "tv", entry.tmdbId)
        : await resolveTMDB({ name: entry.name, year: entry.year, kind: entry.kind, imdbId: entry.imdbId });
    } catch {
      /* A missing catalogue match must not hide a verified announcement. */
    }
  return {
    ...title,
    name: entry.name,
    poster: title.poster || entry.poster || null,
    id: basic.id,
    upcomingRelease: {
      kind: "streaming",
      region: "GB",
      date: entry.date,
      service: entry.service,
      label: entry.label,
      sourceUrl: entry.sourceUrl,
      verifiedOn: entry.verifiedOn || announcementsReviewedOn,
    },
  };
}
export async function serviceArrivalTitle(id: string, client?: SupabaseClient) {
  const feed = await readReleaseFeed(client),
    entry = feed.entries.find((a) => "arrival-" + a.id === id);
  return entry ? announcementTitle(entry) : null;
}
export async function serviceArrivals(options: ArrivalOptions, client?: SupabaseClient) {
  const feed = await readReleaseFeed(client),
    rows = matchingAnnouncements(options, feed.entries),
    titles: Title[] = [];
  for (let i = 0; i < rows.length; i += 4)
    titles.push(...(await Promise.all(rows.slice(i, i + 4).map(announcementTitle))));
  return {
    titles,
    from: options.from,
    to: options.to,
    reviewedOn: feed.reviewedOn,
    coverage: "selected-announcements",
    message: feed.message,
    live: feed.live,
    coveredServices: [...new Set(feed.entries.map((a) => a.service))],
  };
}
