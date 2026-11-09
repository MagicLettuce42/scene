import { catalogueRegion } from "./region-server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { services, type Title } from "./catalogue";
import { addDays, londonDate } from "./episode-calendar";
import { readReleaseFeed, feedAnnouncement, type FeedAnnouncement } from "./release-feed";
import { announcementTitle } from "./service-arrivals";
export type ActivityMode = "new" | "leaving";
export type ActivityItem = { title: Title; date: string; service: string; label: string; sourceUrl: string };
export type ActivityData = {
  items: ActivityItem[];
  from: string;
  to: string;
  reviewedOn: string | null;
  live: boolean;
  message: string | null;
  total: number;
};
export function parseActivityQuery(p: URLSearchParams) {
  const mode = p.get("mode") || "new",
    raw = p.get("services") || "",
    selected = [...new Set(raw.split(",").filter(Boolean))];
  if (
    !["new", "leaving"].includes(mode) ||
    raw.length > 200 ||
    selected.some((k) => !services.some((s) => s.key === k))
  )
    return null;
  return { mode: mode as ActivityMode, selected };
}
export function activityWindow(mode: ActivityMode, now = new Date()) {
  const today = londonDate(now);
  return mode === "new" ? { from: addDays(today, -6), to: today } : { from: today, to: addDays(today, 29) };
}
export function activityEntries(
  entries: FeedAnnouncement[],
  mode: ActivityMode,
  selected: string[],
  now = new Date(),
) {
  const { from, to } = activityWindow(mode, now);
  return entries
    .filter((e) => e.date >= from && e.date <= to && selected.includes(e.service))
    .sort(
      (a, b) =>
        (mode === "new" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) ||
        a.name.localeCompare(b.name),
    );
}
export function departureEntry(row: any) {
  return feedAnnouncement({ ...row, release_date: row?.last_available_date, label: "Last day to watch" });
}
export async function readDepartures(client: SupabaseClient) {
  if (catalogueRegion() === "US") return { entries: [] as FeedAnnouncement[], reviewedOn: null, live: false, message: "US leaving dates are not covered yet. Browse and search show current US availability." };
  const [{ data, error }, { data: status, error: statusError }] = await Promise.all([
    client
      .from("scene_departures")
      .select("*")
      .eq("active", true)
      .gte("last_available_date", londonDate())
      .order("last_available_date")
      .limit(1000),
    client
      .from("scene_release_status")
      .select("departure_reviewed_at,departure_coverage_note")
      .eq("id", 1)
      .maybeSingle(),
  ]);
  if (error || statusError) throw Error("Leaving dates could not load. Please try again.");
  return {
    entries: (data || []).map(departureEntry).filter((e): e is FeedAnnouncement => !!e),
    reviewedOn: status?.departure_reviewed_at?.slice(0, 10) || null,
    live: true,
    message: status?.departure_coverage_note || null,
  };
}
async function departureTitle(e: FeedAnnouncement) {
  const t = await announcementTitle(e);
  const { upcomingRelease, ...title } = t;
  return {
    ...title,
    id: "departure-" + e.id,
    summary:
      t.summary ===
      `${e.label}, announced for ${services.find((s) => s.key === e.service)!.name} in the UK. See the provider announcement for details.`
        ? `Last available on ${services.find((s) => s.key === e.service)!.name} in the UK on ${e.date}. Check the provider for details.`
        : t.summary,
  };
}
export async function serviceDepartureTitle(id: string, client: SupabaseClient) {
  if (catalogueRegion() === "US") return null;
  const { data, error } = await client
    .from("scene_departures")
    .select("*")
    .eq("id", id.slice(10))
    .maybeSingle();
  if (error) throw error;
  const entry = data ? departureEntry(data) : null;
  return entry ? departureTitle(entry) : null;
}
export async function serviceActivity(
  mode: ActivityMode,
  selected: string[],
  client: SupabaseClient,
): Promise<ActivityData> {
  const feed = mode === "new" ? await readReleaseFeed(client) : await readDepartures(client),
    entries = activityEntries(feed.entries, mode, selected),
    items: ActivityItem[] = [];
  // Bound upstream work for large review feeds.
  for (let i = 0; i < Math.min(entries.length, 24); i += 4)
    items.push(
      ...(await Promise.all(
        entries.slice(i, i + 4).map(async (e) => ({
          title: mode === "new" ? await announcementTitle(e) : await departureTitle(e),
          date: e.date,
          service: e.service,
          label: e.label,
          sourceUrl: e.sourceUrl,
        })),
      )),
    );
  return {
    ...activityWindow(mode),
    items,
    reviewedOn: feed.reviewedOn,
    live: feed.live,
    message: feed.message,
    total: entries.length,
  };
}
