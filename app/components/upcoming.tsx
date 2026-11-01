"use client";
import SelectControl from "./select-control";
import UpcomingOptions from "./upcoming-options";
import ReleaseCalendar from "./release-calendar";
import { UpcomingGames, type GamingProps } from "./gaming";
import ServiceArrivals from "./service-arrivals";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CalendarDays, LayoutGrid, LoaderCircle, Plus, RotateCcw } from "lucide-react";
import { cachedJSON, readCache, writeCache } from "../../lib/client-cache";
import { sessionBoundary } from "../../lib/auth/session-boundary";
import { londonDate } from "../../lib/episode-calendar";
import { releaseDateText, type UpcomingFilters } from "../../lib/upcoming";
import { findFeedback } from "../../lib/preferences";
import type { Title } from "../../lib/catalogue";
import { TitleCard, Skeletons, type CardActions } from "./catalogue-cards";

type Page = {
  titles: Title[];
  page: number;
  hasMore: boolean;
  from: string;
  to: string;
  message: string | null;
};
type State = { key: string; data: Page | null; busy: boolean; error: string; attempt: number };
type UpcomingProps = CardActions & {
  serviceFilter?: ReactNode;
  filters: UpcomingFilters;
  onFilters: (filters: UpcomingFilters) => void;
  onServices: () => void;
  gaming?: GamingProps;
};
export default function Upcoming(props: UpcomingProps) {
  const section =
    props.filters.section === "games" && !props.gaming ? "services" : props.filters.section || "services";
  useEffect(() => {
    if (props.filters.section === "games" && !props.gaming)
      props.onFilters({ ...props.filters, section: "services" });
  }, [props.filters, props.gaming, props.onFilters]);
  return (
    <div className="upcoming-releases">
      <div className="upcoming-toolbar">
        <div className="upcoming-sections" aria-label="Upcoming views">
          <button
            className={section === "services" ? "active" : ""}
            aria-pressed={section === "services"}
            onClick={() => props.onFilters({ ...props.filters, section: "services" })}
          >
            Streaming
          </button>
          <button
            className={section === "releases" ? "active" : ""}
            aria-pressed={section === "releases"}
            onClick={() => props.onFilters({ ...props.filters, section: "releases" })}
          >
            Cinema & digital
          </button>
          {props.gaming && (
            <button
              className={section === "games" ? "active" : ""}
              aria-pressed={section === "games"}
              onClick={() => props.onFilters({ ...props.filters, section: "games" })}
            >
              Games
            </button>
          )}
        </div>
        <details className="upcoming-layout-menu"><summary aria-label={`View: ${props.filters.layout === "calendar" ? "Calendar" : "Cards"}. Display options`}>{props.filters.layout === "calendar" ? <CalendarDays size={16} aria-hidden="true"/> : <LayoutGrid size={16} aria-hidden="true"/>}{props.filters.layout === "calendar" ? "Calendar" : "Cards"}</summary>
        <div className="upcoming-layout" role="group" aria-label="Release layout">
          {(
            [
              { id: "cards", label: "Cards", Icon: LayoutGrid },
              { id: "calendar", label: "Calendar", Icon: CalendarDays },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              aria-pressed={(props.filters.layout || "cards") === id}
              onClick={e => { props.onFilters({ ...props.filters, layout: id }); e.currentTarget.closest("details")?.removeAttribute("open"); }}
            >
              <Icon size={16} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div></details>
      </div>
      {section === "games" && props.gaming ? (
        <UpcomingGames {...props.gaming} calendar={props.filters.layout === "calendar"} />
      ) : section === "services" ? (
        <ServiceArrivals {...props} />
      ) : (
        <ReleaseCatalogue {...props} />
      )}
    </div>
  );
}
function ReleaseCatalogue({ filters, onFilters, ...actions }: UpcomingProps) {
  const [today, setToday] = useState(londonDate);
  useEffect(() => {
    const timer = setInterval(() => setToday(londonDate()), 60000);
    return () => clearInterval(timer);
  }, []);
  const query = new URLSearchParams({
    kind: "movie",
    format: filters.format,
    days: String(filters.days),
    date: today,
  }).toString();
  const key = "upcoming:" + query;
  const [state, setState] = useState<State>({ key: "", data: null, busy: true, error: "", attempt: 1 });
  const abort = useRef<AbortController | null>(null),
    pageData = useRef<{ key: string; data: Page } | null>(null);
  const load = useCallback(
    async (page = 1, force = false) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const boundary = sessionBoundary();
      setState((previous) => ({
        key,
        data: previous.key === key ? previous.data : null,
        busy: true,
        error: "",
        attempt: page,
      }));
      try {
        const data = await cachedJSON<Page>(
          "/api/upcoming?" + query + "&page=" + page,
          controller.signal,
          force,
        );
        if (controller.signal.aborted) return;
        const previous = pageData.current?.key === key ? pageData.current.data : null;
        const titles =
          page > 1 && previous
            ? Array.from(new Map([...previous.titles, ...data.titles].map((t) => [t.id, t])).values())
            : data.titles;
        const merged = { ...data, titles };
        pageData.current = { key, data: merged };
        writeCache(key, merged, boundary);
        setState({ key, data: merged, busy: false, error: "", attempt: page });
      } catch (error) {
        if (!controller.signal.aborted)
          setState((previous) => ({
            ...previous,
            busy: false,
            error: (error as Error).message || "Upcoming releases could not load.",
          }));
      }
    },
    [key, query],
  );
  useEffect(() => {
    const cached = readCache<Page>(key);
    if (cached) {
      pageData.current = { key, data: cached };
      setState({ key, data: cached, busy: false, error: "", attempt: cached.page });
    } else void load();
    return () => abort.current?.abort();
  }, [key, load]);
  const active = state.key === key,
    data = active ? state.data : null,
    busy = !active || state.busy;
  const items = (data?.titles || []).filter(
    (t) => !findFeedback(actions.feedback, t)?.hidden && t.upcomingRelease && t.upcomingRelease.date >= today,
  );
  const change = (patch: Partial<UpcomingFilters>) => onFilters({ ...filters, ...patch });
  const renderItems = (titles: Title[]) => (
    <div className="poster-grid">
      {titles.map((title) => (
        <TitleCard key={title.id} title={title} {...actions} releaseFocus />
      ))}
    </div>
  );
  return (
    <div className="upcoming-releases">

      <UpcomingOptions
        summary={`${filters.format === "cinema" ? "UK cinema" : filters.format === "digital" ? "UK digital" : "Cinema & digital"} · Next ${filters.days} days`}
      >
      <p className="upcoming-intro">
        Upcoming UK cinema and digital film releases. Save a film to keep its announced date in your
        watchlist.
      </p>
        <div className="upcoming-controls">
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
          <label>
            Release type
            <SelectControl
              value={filters.format}
              onChange={(e) => change({ format: e.target.value as UpcomingFilters["format"] })}
            >
              <option value="all">Cinema & digital</option>
              <option value="cinema">UK cinema</option>
              <option value="digital">UK digital</option>
            </SelectControl>
          </label>
        </div>
        <div className="upcoming-note">
          <CalendarDays size={20} aria-hidden="true" />
          <p>
            UK cinema and digital dates, including re-releases. Digital can mean rental or purchase; a date
            does not confirm inclusion in a subscription. These film releases aren’t filtered by My services.
            Dates can change.
          </p>
        </div>
      </UpcomingOptions>
      <p className="upcoming-status" role="status" aria-live="polite">
        {busy && !data
          ? "Finding upcoming releases…"
          : data
            ? `${items.length} ${items.length === 1 ? "release" : "releases"} shown · Popular first · ${releaseDateText(data.from)} – ${releaseDateText(data.to)}`
            : ""}
      </p>
      {active && (state.error || data?.message) && (
        <div className="error-notice" role="alert">
          {state.error || data?.message}
          <button disabled={busy} onClick={() => load(state.attempt, true)}>
            <RotateCcw size={14} /> Retry page
          </button>
        </div>
      )}
      {busy && !data ? (
        <Skeletons count={6} />
      ) : filters.layout === "calendar" && data ? (
        <ReleaseCalendar
          items={items}
          dateOf={(title) => title.upcomingRelease?.date}
          from={data.from}
          to={data.to}
          renderItems={renderItems}
          coverageNote={
            data.hasMore
              ? "Showing releases loaded so far. Use Load more releases below to add dates to this calendar."
              : "Showing matching releases in the selected date range. Dates can change."
          }
        />
      ) : items.length ? (
        renderItems(items)
      ) : (
        !state.error && (
          <div className="empty-state">
            <CalendarDays size={34} />
            <h3>No confirmed releases to show here</h3>
            <p>
              {data?.hasMore
                ? "No matching dates in this batch. Load more releases below, or widen the date range."
                : "Try another release type or a longer date range. Titles appear once a matching date is listed."}
            </p>
            {filters.days !== 90 && (
              <button className="button secondary" onClick={() => change({ days: 90 })}>
                Look ahead 90 days <ArrowRight size={16} />
              </button>
            )}
          </div>
        )
      )}
      {data?.hasMore && (
        <div className="browse-pagination">
          <button className="button secondary" disabled={busy} onClick={() => load(data.page + 1)}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}{" "}
            {busy ? "Loading…" : "Load more releases"}
          </button>
        </div>
      )}
      <p className="fine-print upcoming-source">
        Release dates from TMDB. Save a title to keep its announced date in your watchlist; open its details
        to check for updates.
      </p>
    </div>
  );
}
