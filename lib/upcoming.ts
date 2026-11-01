import { services } from "./catalogue";
import { addDays, londonDate, validCalendarDate } from "./episode-calendar";

export type UpcomingRelease =
  | { date: string; kind: "cinema" | "digital" | "series"; region: "GB" | "original" }
  | {
      date: string;
      kind: "streaming";
      region: "GB";
      service: string;
      label: string;
      sourceUrl: string;
      verifiedOn: string;
    };
export type UpcomingFilters = {
  kind: "movie" | "tv";
  format: "all" | "cinema" | "digital";
  days: 7 | 30 | 90;
  section?: "services" | "releases" | "games";
  layout?: "cards" | "calendar";
  provider?: string;
  serviceKind?: "all" | "movie" | "tv";
};
export type UpcomingOptions = UpcomingFilters & { page: number; from: string; to: string };
export const defaultUpcoming = (): UpcomingFilters => ({
  kind: "movie",
  format: "all",
  days: 30,
  section: "services",
  provider: "mine",
  serviceKind: "all",
});
export function cleanUpcomingFilters(value: unknown): UpcomingFilters {
  const v = value as Partial<UpcomingFilters> | null;
  return {
    kind: "movie",
    format: v?.format === "cinema" || v?.format === "digital" ? v.format : "all",
    days: v?.days === 7 || v?.days === 90 ? v.days : 30,
    section: v?.section === "releases" || v?.section === "games" ? v.section : "services",
    layout: v?.layout === "calendar" ? "calendar" : "cards",
    provider:
      v?.provider && (["mine", "all"].includes(v.provider) || services.some((s) => s.key === v.provider))
        ? v.provider
        : "mine",
    serviceKind: v?.serviceKind === "movie" || v?.serviceKind === "tv" ? v.serviceKind : "all",
  };
}
export function parseUpcomingQuery(params: URLSearchParams, now = new Date()): UpcomingOptions | null {
  const kind = params.get("kind") || "movie",
    format = params.get("format") || "all",
    days = params.get("days") || "30",
    page = params.get("page") || "1";
  if (
    !["movie", "tv"].includes(kind) ||
    !["all", "cinema", "digital"].includes(format) ||
    !["7", "30", "90"].includes(days) ||
    !/^\d{1,3}$/.test(page) ||
    Number(page) < 1 ||
    Number(page) > 500
  )
    return null;
  const from = londonDate(now);
  return {
    kind: kind as UpcomingFilters["kind"],
    format: format as UpcomingFilters["format"],
    days: Number(days) as UpcomingFilters["days"],
    page: Number(page),
    from,
    to: addDays(from, Number(days) - 1),
  };
}
export function cleanUpcomingRelease(value: unknown): UpcomingRelease | undefined {
  if (!value || typeof value !== "object") return;
  const v = value as UpcomingRelease;
  if (typeof v.date !== "string" || !validCalendarDate(v.date)) return;
  if (
    v.kind === "streaming" &&
    v.region === "GB" &&
    services.some((s) => s.key === v.service) &&
    typeof v.label === "string" &&
    v.label.length <= 60 &&
    typeof v.verifiedOn === "string" &&
    validCalendarDate(v.verifiedOn) &&
    typeof v.sourceUrl === "string" &&
    v.sourceUrl.length < 1000
  ) {
    try {
      const url = new URL(v.sourceUrl);
      if (url.protocol === "https:" && !url.username && !url.password)
        return {
          date: v.date,
          kind: v.kind,
          region: v.region,
          service: v.service,
          label: v.label,
          sourceUrl: url.href,
          verifiedOn: v.verifiedOn,
        };
    } catch {}
    return;
  }
  if (
    ((v.kind === "cinema" || v.kind === "digital") && v.region === "GB") ||
    (v.kind === "series" && v.region === "original")
  )
    return { date: v.date, kind: v.kind, region: v.region };
}
// Regional movie dates are checked explicitly: a primary/worldwide release date
// is never substituted for a missing UK cinema or digital date.
export function selectUpcomingRelease(
  source: any,
  kind: "movie" | "tv",
  from = londonDate(),
  to = "2100-12-31",
  format: UpcomingFilters["format"] = "all",
): UpcomingRelease | undefined {
  if (kind === "tv") {
    const date = source.first_air_date;
    return typeof date === "string" && validCalendarDate(date) && date >= from && date <= to
      ? { date, kind: "series", region: "original" }
      : undefined;
  }
  const rows = source.release_dates?.results?.find((r: any) => r.iso_3166_1 === "GB")?.release_dates;
  if (!Array.isArray(rows)) return;
  const matches: UpcomingRelease[] = [];
  for (const row of rows) {
    const date = typeof row.release_date === "string" ? row.release_date.slice(0, 10) : "",
      releaseKind = row.type === 4 ? "digital" : row.type === 2 || row.type === 3 ? "cinema" : null;
    if (
      releaseKind &&
      (format === "all" || format === releaseKind) &&
      validCalendarDate(date) &&
      date >= from &&
      date <= to
    )
      matches.push({ date, kind: releaseKind, region: "GB" });
  }
  return matches.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))[0];
}
export function releaseLabel(release: UpcomingRelease) {
  return release.kind === "streaming"
    ? `${services.find((s) => s.key === release.service)?.name || "Streaming"} · ${release.label}`
    : release.kind === "cinema"
      ? "UK cinema"
      : release.kind === "digital"
        ? "UK digital"
        : "Series premiere";
}
export function releaseDateText(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
