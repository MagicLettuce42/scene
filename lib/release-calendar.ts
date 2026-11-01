import { addDays, validCalendarDate, weekStart } from "./episode-calendar";

export function calendarMonthDays(month: string) {
  const first = month + "-01";
  if (!validCalendarDate(first)) return [];
  const next = shiftCalendarMonth(month, 1) + "-01",
    last = addDays(next, -1),
    start = weekStart(first);
  const count = Math.ceil((Math.round((Date.parse(last) - Date.parse(start)) / 86400000) + 1) / 7) * 7;
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}
export function shiftCalendarMonth(month: string, offset: number) {
  const date = new Date(month + "-01T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
export function groupCalendarReleases<T>(
  items: T[],
  dateOf: (item: T) => string | undefined,
  from: string,
  to: string,
) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const date = dateOf(item);
    if (date && validCalendarDate(date) && date >= from && date <= to)
      groups.set(date, [...(groups.get(date) || []), item]);
  }
  return groups;
}
