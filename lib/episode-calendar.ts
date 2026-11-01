import type { Episode, Season } from "./episodes";
export type CalendarEpisode = Episode & { season: number };
export type CalendarData = { episodes: CalendarEpisode[]; partial: boolean };
export function londonDate(now = new Date()) {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}-${p.find((x) => x.type === "day")!.value}`;
}
export function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function weekStart(date = londonDate()) {
  const d = new Date(date + "T12:00:00Z");
  return addDays(date, -((d.getUTCDay() + 6) % 7));
}
export function validCalendarDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value &&
    value >= "1900-01-01" &&
    value <= "2100-12-31"
  );
}
export function calendarSeasons(seasons: Season[], from: string, to: string) {
  const dated = seasons
    .filter((s) => s.number > 0 && s.airDate && s.airDate <= to)
    .sort((a, b) => a.airDate!.localeCompare(b.airDate!));
  const possible = dated.filter((s, i) => !dated[i + 1] || dated[i + 1].airDate! >= from);
  const unknown = seasons.filter((s) => s.number > 0 && !s.airDate).slice(-2);
  const all = [...possible, ...unknown];
  return { seasons: all.slice(-4), partial: all.length > 4 };
}
