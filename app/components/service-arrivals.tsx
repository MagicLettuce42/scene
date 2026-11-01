"use client";
import SelectControl from "./select-control";
import UpcomingOptions from "./upcoming-options";
import ReleaseCalendar from "./release-calendar";
import { ReminderButton } from "./release-reminders";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, ArrowUpRight, SlidersHorizontal, RotateCcw } from "lucide-react";
import { services, type Title } from "../../lib/catalogue";
import { cachedJSON, readCache } from "../../lib/client-cache";
import { londonDate } from "../../lib/episode-calendar";
import { releaseDateText, type UpcomingFilters } from "../../lib/upcoming";
import { findFeedback } from "../../lib/preferences";
import { TitleCard, Skeletons, type CardActions } from "./catalogue-cards";
type Data = {
  titles: Title[];
  from: string;
  to: string;
  reviewedOn: string;
  coveredServices: string[];
  message?: string | null;
  live?: boolean;
};
export default function ServiceArrivals({
  serviceFilter,
  filters,
  onFilters,
  onServices,
  ...actions
}: CardActions & {
  serviceFilter?: ReactNode;
  filters: UpcomingFilters;
  onFilters: (value: UpcomingFilters) => void;
  onServices: () => void;
}) {
  const [today, setToday] = useState(londonDate),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setToday(londonDate()), 60000);
    return () => clearInterval(timer);
  }, []);
  const provider = filters.provider || "mine",
    kind = filters.serviceKind || "all";
  const url =
    "/api/upcoming/services?" +
    new URLSearchParams({
      provider,
      kind,
      days: String(filters.days),
      services: [...actions.selected].sort().join(","),
      date: today,
    });
  const [state, setState] = useState<{ url: string; data: Data | null; error: string; busy: boolean }>({
    url: "",
    data: null,
    error: "",
    busy: true,
  });
  useEffect(() => {
    const controller = new AbortController(),
      cached = readCache<Data>(url);
    setState({ url, data: cached, error: "", busy: !cached });
    cachedJSON<Data>(url, controller.signal, retry > 0)
      .then((data) => {
        if (!controller.signal.aborted) setState({ url, data, error: "", busy: false });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setState({ url, data: cached, error: e.message, busy: false });
      });
    return () => controller.abort();
  }, [url, retry]);
  const active = state.url === url,
    data = active ? state.data : null,
    busy = !active || state.busy;
  const titles = (data?.titles || []).filter(
    (t) => !findFeedback(actions.feedback, t)?.hidden && t.upcomingRelease && t.upcomingRelease.date >= today,
  );
  const change = (patch: Partial<UpcomingFilters>) => onFilters({ ...filters, ...patch });
  const noServices = provider === "mine" && !actions.selected.length;
  const renderItems = (entries: Title[]) => (
    <div className="poster-grid">
      {entries.map((title) => (
        <div key={title.id} className="arrival-card">
          <TitleCard title={title} {...actions} releaseFocus />
          <ReminderButton title={title} />
          {title.upcomingRelease?.kind === "streaming" && (
            <a
              className="arrival-source"
              href={title.upcomingRelease.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Read the official announcement for ${title.name}`}
            >
              Official announcement <ArrowUpRight size={12} />
            </a>
          )}
        </div>
      ))}
    </div>
  );
  return (
    <div className="service-arrivals">

      <UpcomingOptions
        summary={`${provider === "mine" ? "My services" : provider === "all" ? "All services" : services.find((s) => s.key === provider)?.name || "My services"} · ${kind === "movie" ? "Films" : kind === "tv" ? "TV series" : "All content"} · Next ${filters.days} days`}
      >
      <p className="upcoming-intro">
        Films, new series and returning seasons announced for your streaming services.
      </p>
        <div className="upcoming-controls service-arrival-controls">
          {serviceFilter}
          <label>
            When
            <SelectControl
              value={filters.days}
              onChange={(e) => change({ days: Number(e.target.value) as UpcomingFilters["days"] })}
            >
              <option value="7">Next 7 days</option>
              <option value="30">Next 30 days</option>
              <option value="90">Next 90 days</option>
            </SelectControl>
          </label>
          <fieldset className="arrival-content-type" aria-describedby="arrival-type-help">
            <legend>Content type</legend>
            <div className="arrival-type-options">
              {(
                [
                  { value: "all", label: "All" },
                  { value: "movie", label: "Films" },
                  { value: "tv", label: "TV series" },
                ] as const
              ).map((option) => (
                <label key={option.value}>
                  <input
                    type="radio"
                    name="arrival-content-type"
                    value={option.value}
                    checked={kind === option.value}
                    onChange={() => change({ serviceKind: option.value })}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <p id="arrival-type-help">TV series includes new shows, returning seasons and new episodes.</p>
          </fieldset>
        </div>
        <div className="upcoming-note">
          <CalendarDays size={20} aria-hidden="true" />
          <div>
            <p>
              <strong>Selected UK streaming releases.</strong> Official announcements, reviewed daily. This is
              a selection, not a complete release calendar. Dates can change.
            </p>
            {data &&
              (!data.live ||
                data.reviewedOn < new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)) && (
                <p className="fine-print">
                  {!data.live
                    ? "Live updates could not load; showing the saved selection."
                    : "The last review was more than a week ago. Check the official announcement for updates."}
                </p>
              )}
            {data && (
              <details className="arrival-coverage">
                <summary>Sources and last checked</summary>
                <p className="arrival-reviewed">
                  {data.message && <>{data.message} </>}Last checked {releaseDateText(data.reviewedOn)}.
                  Includes announcements from{" "}
                  {data.coveredServices
                    .map((k) => services.find((s) => s.key === k)?.name)
                    .filter(Boolean)
                    .join(", ")}
                  .
                </p>
              </details>
            )}
          </div>
        </div>
      </UpcomingOptions>
      <p className="upcoming-status" role="status" aria-live="polite">
        {noServices
          ? "Choose your services to personalise arrivals."
          : busy && !data
            ? "Loading service announcements…"
            : data
              ? `${titles.length} ${titles.length === 1 ? "arrival" : "arrivals"} · Soonest first · ${releaseDateText(data.from)} – ${releaseDateText(data.to)}`
              : ""}
      </p>
      {active && state.error && (
        <div className="error-notice" role="alert">
          {state.error}
          <button disabled={busy} onClick={() => setRetry((n) => n + 1)}>
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      )}
      {noServices ? (
        <div className="empty-state">
          <SlidersHorizontal size={32} />
          <h3>What do you watch on?</h3>
          <p>
            Select your services to see matching announcements.
          </p>
          <button className="button primary" onClick={onServices}>
            Choose my services
          </button>
        </div>
      ) : busy && !data ? (
        <Skeletons count={6} />
      ) : filters.layout === "calendar" && data ? (
        <ReleaseCalendar
          items={titles}
          dateOf={(title) => title.upcomingRelease?.date}
          from={data.from}
          to={data.to}
          renderItems={renderItems}
          coverageNote="Selected UK announcements matching your filters. Dates can change; this calendar does not cover every release."
        />
      ) : titles.length ? (
        renderItems(titles)
      ) : (
        !state.error && (
          <div className="empty-state">
            <CalendarDays size={32} />
            <h3>No announcements listed for these filters</h3>
            <p>
              This doesn’t mean nothing is coming. Try My services under Filters & info → Service or a longer date
              range in Filters & info. Only verified announcements in this selection appear here.
            </p>
            {filters.days !== 90 && (
              <button className="button secondary" onClick={() => change({ days: 90 })}>
                Look ahead 90 days
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}
