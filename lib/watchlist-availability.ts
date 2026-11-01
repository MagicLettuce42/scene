import { type Title } from "./catalogue";
import { londonDate } from "./episode-calendar";
export type AvailabilityFilter = "all" | "available" | "upcoming" | "unchecked" | "unavailable";
export const availabilityLabels = {
  all: "All saved titles",
  available: "Available now",
  upcoming: "Coming soon",
  unchecked: "Check availability",
  unavailable: "Not on my services",
} as const;
export function watchlistAvailability(
  title: Title,
  selected: string[],
  now = new Date(),
): Exclude<AvailabilityFilter, "all"> {
  const release = title.upcomingRelease;
  if (
    release &&
    release.date > londonDate(now) &&
    (release.kind !== "streaming" || selected.includes(release.service))
  )
    return "upcoming";
  const checked = title.checked ? Date.parse(title.checked) : NaN;
  if (
    !selected.length ||
    !Number.isFinite(checked) ||
    checked > now.getTime() + 60000 ||
    now.getTime() - checked > 86400000 ||
    !title.live
  )
    return "unchecked";
  return title.offers.some((o) => selected.includes(o.key) && (o.type === "sub" || o.type === "free"))
    ? "available"
    : "unavailable";
}
export function cleanAvailabilityFilter(value: unknown): AvailabilityFilter {
  return typeof value === "string" && Object.hasOwn(availabilityLabels, value)
    ? (value as AvailabilityFilter)
    : "all";
}
