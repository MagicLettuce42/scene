import { catalogueRegion } from "./region-server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { services } from "./catalogue";
import { validCalendarDate, londonDate, addDays } from "./episode-calendar";
import {
  announcementsReviewedOn,
  serviceAnnouncements,
  type ServiceAnnouncement,
} from "./service-announcements";
export type FeedAnnouncement = ServiceAnnouncement & {
  tmdbId?: number;
  imdbId?: string;
  poster?: string;
  verifiedOn?: string;
  eventType?: string;
};
export function feedAnnouncement(row: any): FeedAnnouncement | null {
  if (
    !row ||
    typeof row.id !== "string" ||
    !/^[a-z0-9-]{1,80}$/.test(row.id) ||
    typeof row.title !== "string" ||
    !row.title.trim() ||
    row.title.length > 250 ||
    !["movie", "series"].includes(row.kind) ||
    !services.some((s) => s.key === row.service_key) ||
    !validCalendarDate(row.release_date) ||
    !validCalendarDate(row.verified_on) ||
    typeof row.label !== "string" ||
    row.label.length > 60
  )
    return null;
  let source: URL;
  try {
    source = new URL(row.source_url);
    if (source.protocol !== "https:" || source.username || source.password) return null;
  } catch {
    return null;
  }
  const poster =
    typeof row.poster_url === "string" &&
    /^https:\/\/image\.tmdb\.org\/t\/p\/(w500|original)\/[a-zA-Z0-9._-]+$/.test(row.poster_url)
      ? row.poster_url
      : undefined;
  return {
    id: row.id,
    name: row.title,
    kind: row.kind,
    year: Number.isInteger(row.original_year) ? row.original_year : null,
    date: row.release_date,
    service: row.service_key,
    label: row.label,
    sourceUrl: source.href,
    tmdbId: Number.isSafeInteger(row.tmdb_id) && row.tmdb_id > 0 ? row.tmdb_id : undefined,
    imdbId: typeof row.imdb_id === "string" && /^tt\d+$/.test(row.imdb_id) ? row.imdb_id : undefined,
    poster,
    verifiedOn: row.verified_on,
    eventType: row.event_type,
  };
}
export async function readReleaseFeed(client?: SupabaseClient) {
  if (catalogueRegion() === "US") return { entries: [] as FeedAnnouncement[], reviewedOn: null, live: false, message: "US streaming announcements are not covered yet. Browse and search show current US availability." };
  if (client) {
    try {
      const [{ data, error }, { data: status }] = await Promise.all([
        client
          .from("scene_releases")
          .select("*")
          .eq("active", true)
          .gte("release_date", addDays(londonDate(), -90))
          .order("release_date")
          .limit(1000),
        client.from("scene_release_status").select("reviewed_at,coverage_note").eq("id", 1).maybeSingle(),
      ]);
      if (error) throw error;
      const entries = (data || []).map(feedAnnouncement).filter((a): a is FeedAnnouncement => !!a);
      return {
        entries,
        reviewedOn:
          status?.reviewed_at?.slice(0, 10) ||
          entries
            .map((e) => e.verifiedOn!)
            .sort()
            .at(-1) ||
          announcementsReviewedOn,
        live: true,
        message: status?.coverage_note || null,
      };
    } catch {
      /* Keep the last bundled reviewed selection available during an outage. */
    }
  }
  return {
    entries: serviceAnnouncements as FeedAnnouncement[],
    reviewedOn: announcementsReviewedOn,
    live: false,
    message: "Live release updates could not load. Showing the saved announcement selection.",
  };
}
