import { resolveRegion } from "./region";
import { cleanTitle, titleKey, type LibraryDocument } from "./library-state";
import { announcementsReviewedOn } from "./service-announcements";
import type { FeedAnnouncement } from "./release-feed";
import { normalizedTitleName } from "./tmdb";
import { londonDate } from "./episode-calendar";
export type AvailabilitySnapshot = {
  title_key: string;
  title: unknown;
  checked_at: string | null;
  last_error?: boolean;
};
export function applyAvailabilitySnapshots(
  document: LibraryDocument,
  snapshots: AvailabilitySnapshot[],
  releases: FeedAnnouncement[] = [],
  now = new Date(),
): LibraryDocument {
  if (document.preferences?.autoAvailability === false) return document;
  const rows = new Map(snapshots.map((s) => [s.title_key, s]));
  const entries = { ...document.entries };
  const selected = Object.keys(document.services).filter((k) => document.services[k]);
  for (const [key, entry] of Object.entries(entries)) {
    if (!entry.saved) continue;
    const row = rows.get(titleKey(entry.title));
    if (!row?.title || !row.checked_at) continue;
    const fresh = cleanTitle(row.title),
      at = Date.parse(row.checked_at),
      previous = Date.parse(entry.title.checked || "");
    if (
      !fresh ||
      resolveRegion(fresh.availabilityRegion) !== resolveRegion(document.preferences?.region) ||
      !Number.isFinite(at) ||
      at > now.getTime() + 60000 ||
      (Number.isFinite(previous) && previous > at)
    )
      continue;
    const announcement = (resolveRegion(document.preferences?.region) === "GB" ? releases : [])
      .filter(
        (a) =>
          a.date >= londonDate(now) &&
          a.kind === fresh.kind &&
          selected.includes(a.service) &&
          (a.tmdbId && fresh.tmdbId
            ? a.tmdbId === fresh.tmdbId
            : normalizedTitleName(a.name) === normalizedTitleName(fresh.name) && a.year === fresh.year),
      )
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    entries[key] = {
      ...entry,
      title: {
        ...fresh,
        id: entry.title.id,
        checked: row.checked_at,
        upcomingRelease: announcement
          ? {
              kind: "streaming",
              region: "GB",
              date: announcement.date,
              service: announcement.service,
              label: announcement.label,
              sourceUrl: announcement.sourceUrl,
              verifiedOn: announcement.verifiedOn || announcementsReviewedOn,
            }
          : entry.title.upcomingRelease?.kind !== "streaming"
            ? entry.title.upcomingRelease
            : undefined,
      },
    };
  }
  return { ...document, entries };
}
