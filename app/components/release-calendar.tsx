"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { londonDate } from "../../lib/episode-calendar";
import { calendarMonthDays, groupCalendarReleases, shiftCalendarMonth } from "../../lib/release-calendar";

type CalendarProps<T> = {
  items: T[];
  dateOf: (item: T) => string | undefined;
  from: string;
  to: string;
  renderItems: (items: T[]) => ReactNode;
  coverageNote: string;
};
const fullDate = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));

export default function ReleaseCalendar<T>({
  items,
  dateOf,
  from,
  to,
  renderItems,
  coverageNote,
}: CalendarProps<T>) {
  const [chosenMonth, setMonth] = useState(from.slice(0, 7)),
    [chosenDate, setDate] = useState("");
  const headingId = useId(),
    agendaId = useId(),
    today = londonDate(),
    firstMonth = from.slice(0, 7),
    lastMonth = to.slice(0, 7);
  const month = chosenMonth < firstMonth ? firstMonth : chosenMonth > lastMonth ? lastMonth : chosenMonth;
  const groups = groupCalendarReleases(items, dateOf, from, to),
    dates = [...groups.keys()].sort();
  const monthDates = dates.filter((date) => date.startsWith(month));
  const selected =
    chosenDate.startsWith(month) && chosenDate >= from && chosenDate <= to
      ? chosenDate
      : monthDates[0] || (from.startsWith(month) ? from : month + "-01");
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(month + "-01T12:00:00Z"));
  const releases = groups.get(selected) || [],
    total = monthDates.reduce((sum, date) => sum + groups.get(date)!.length, 0);
  function moveMonth(offset: number) {
    setMonth(shiftCalendarMonth(month, offset));
    setDate("");
  }
  return (
    <section className="release-calendar" aria-label="Release calendar">
      <div className="release-calendar-panel">
        <div className="release-calendar-heading">
          <button
            type="button"
            aria-label="Previous month"
            disabled={month <= firstMonth}
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <h3 id={headingId} aria-live="polite">
            {monthLabel}
          </h3>
          <button
            type="button"
            aria-label="Next month"
            disabled={month >= lastMonth}
            onClick={() => moveMonth(1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <p className="release-calendar-summary">
          {total} {total === 1 ? "release" : "releases"} listed this month · Choose a date
        </p>
        <div className="release-calendar-weekdays" aria-hidden="true">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="release-calendar-days" role="group" aria-labelledby={headingId}>
          {calendarMonthDays(month).map((date) => {
            if (!date.startsWith(month))
              return <span className="release-calendar-blank" key={date} aria-hidden="true" />;
            const count = groups.get(date)?.length || 0;
            return (
              <button
                type="button"
                key={date}
                disabled={date < from || date > to}
                aria-label={`${fullDate(date)}, ${count} ${count === 1 ? "release" : "releases"} listed`}
                aria-pressed={date === selected}
                aria-current={date === today ? "date" : undefined}
                aria-controls={agendaId}
                className={count ? "has-releases" : ""}
                onClick={() => setDate(date)}
              >
                <span className="release-calendar-date">{Number(date.slice(-2))}</span>
                {count > 0 && (
                  <span className="release-calendar-count">
                    {count}
                    <span> {count === 1 ? "release" : "releases"}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="release-calendar-coverage">{coverageNote}</p>
      </div>
      <div className="release-calendar-agenda" id={agendaId}>
        <h3>{fullDate(selected)}</h3>
        <p role="status" aria-live="polite">
          {releases.length
            ? `${releases.length} ${releases.length === 1 ? "release" : "releases"} listed for this date.`
            : "No releases listed for this date in the current selection."}
        </p>
        {releases.length > 0 && renderItems(releases)}
      </div>
    </section>
  );
}
