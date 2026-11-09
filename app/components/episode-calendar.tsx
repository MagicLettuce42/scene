"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Check, ArrowRight } from "lucide-react";
import { cachedJSON } from "../../lib/client-cache";
import { sameTitle, type Title } from "../../lib/catalogue";
import { episodeWatched, type SeriesProgress } from "../../lib/episodes";
import { addDays, weekStart, londonDate, type CalendarData } from "../../lib/episode-calendar";
import SpoilerContent from "./spoiler-content";
import type { EpisodeActions } from "./episode-tracker";
type Tracked = { title: Title; progress: SeriesProgress };
type Result = { data?: CalendarData; error?: string };
const label = (date: string, weekday = false) =>
  new Date(date + "T12:00:00Z").toLocaleDateString("en-GB", {
    ...(weekday ? { weekday: "long" as const } : {}),
    day: "numeric",
    month: "short",
  });
export default function EpisodeCalendar({
  items,
  onOpen,
  onEpisodes,
  spoilerFree = false,
  compact = false,
  onViewAll,
}: {
  items: Tracked[];
  onOpen: (title: Title) => void;
  onEpisodes: EpisodeActions["onEpisodes"];
  spoilerFree?: boolean;
  compact?: boolean;
  onViewAll?: () => void;
}) {
  const today = londonDate(),
    [offset, setOffset] = useState(0),
    [limit, setLimit] = useState(20),
    [retry, setRetry] = useState(0),
    [showWatched, setShowWatched] = useState(true);
  const from = compact ? today : addDays(weekStart(today), offset * 7),
    days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const ids = items.map((i) => i.title.tmdbId).filter((id): id is number => !!id),
    shown = ids.slice(0, compact ? 12 : limit),
    requestKey = from + "|" + shown.join(",");
  const [state, setState] = useState<{ key: string; results: Record<string, Result>; busy: boolean }>({
    key: "",
    results: {},
    busy: false,
  });
  useEffect(() => {
    const ac = new AbortController();
    setState({ key: requestKey, results: {}, busy: shown.length > 0 });
    let next = 0;
    async function worker() {
      while (next < shown.length && !ac.signal.aborted) {
        const id = shown[next++];
        let result: Result;
        try {
          result = {
            data: await cachedJSON<CalendarData>(
              `/api/title/tmdb-tv-${id}/calendar?from=${from}`,
              ac.signal,
              retry > 0,
            ),
          };
        } catch (e) {
          if (ac.signal.aborted) return;
          result = { error: (e as Error).message };
        }
        if (!ac.signal.aborted)
          setState((s) => (s.key === requestKey ? { ...s, results: { ...s.results, [id]: result } } : s));
      }
    }
    Promise.all(Array.from({ length: Math.min(3, shown.length) }, () => worker())).then(() => {
      if (!ac.signal.aborted) setState((s) => ({ ...s, busy: false }));
    });
    return () => ac.abort();
  }, [requestKey, retry]);
  const results = state.key === requestKey ? state.results : {},
    busy = state.key !== requestKey || state.busy;
  const events = useMemo(
    () =>
      items
        .flatMap((item) =>
          (results[String(item.title.tmdbId)]?.data?.episodes || []).map((episode) => ({
            title: item.title,
            episode,
            watched: episodeWatched(item.progress, episode.season, episode.number),
          })),
        )
        .filter((e) => showWatched || !e.watched)
        .sort(
          (a, b) =>
            a.episode.airDate!.localeCompare(b.episode.airDate!) || a.title.name.localeCompare(b.title.name),
        ),
    [items, results, showWatched],
  );
  const failed = Object.values(results).filter((r) => r.error || r.data?.partial).length;
  if (compact && !items.length) return null;
  return (
    <section
      className={`episode-calendar ${compact ? "calendar-compact" : ""}`}
      aria-labelledby="calendar-heading"
    >
      <div className="calendar-heading">
        <div>
          <h3 id="calendar-heading">
            <CalendarDays size={19} /> {compact ? "Upcoming episodes" : "Your episode calendar"}
          </h3>
          <p className="fine-print">
            Published air dates for series you track. regional streaming dates may differ; dates can change.
          </p>
        </div>
        {compact && (
          <button className="text-button" onClick={onViewAll}>
            Full calendar <ArrowRight size={15} />
          </button>
        )}
      </div>
      {!items.length ? (
        <div className="quiet-empty">
          <CalendarDays size={30} />
          <h3>Follow your series through the week</h3>
          <p>Open a series and choose “Track episodes”. Its published episode dates will appear here.</p>
        </div>
      ) : (
        <>
          {!compact && (
            <div className="calendar-controls">
              <div>
                <button
                  className="icon-button"
                  aria-label="Previous week"
                  disabled={offset <= -52}
                  onClick={() => setOffset((n) => n - 1)}
                >
                  <ChevronLeft size={20} />
                </button>
                <span>
                  {label(from)} – {label(days[6])}
                </span>
                <button
                  className="icon-button"
                  aria-label="Next week"
                  disabled={offset >= 52}
                  onClick={() => setOffset((n) => n + 1)}
                >
                  <ChevronRight size={20} />
                </button>
                <button className="text-button" disabled={!offset} onClick={() => setOffset(0)}>
                  This week
                </button>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={showWatched}
                  onChange={(e) => setShowWatched(e.target.checked)}
                />{" "}
                Include watched
              </label>
            </div>
          )}
          {busy && (
            <p className="fine-print" role="status">
              Checking episode dates · {Object.keys(results).length} of {shown.length} series
            </p>
          )}
          {failed > 0 && (
            <div className="error-notice" role="alert">
              Dates are incomplete for {failed} {failed === 1 ? "series" : "series"}.
              <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
            </div>
          )}
          {(!busy || events.length > 0) && (
            <div className="calendar-days">
              {days
                .filter((d) => !compact || events.some((e) => e.episode.airDate === d))
                .map((day) => (
                  <section className={`calendar-day ${day === today ? "today" : ""}`} key={day}>
                    <h4>
                      {day === today ? "Today · " : ""}
                      {label(day, true)}
                    </h4>
                    {events
                      .filter((e) => e.episode.airDate === day)
                      .map(({ title, episode, watched }) => (
                        <article
                          className="calendar-event"
                          key={`${title.tmdbId}-${episode.season}-${episode.number}`}
                        >
                          <div>
                            <button className="shared-title" onClick={() => onOpen(title)}>
                              {title.name}
                            </button>
                            <p>
                              Series {episode.season} · Episode {episode.number}
                            </p>
                            <p><SpoilerContent hidden={spoilerFree && !watched} identity={`${title.id}-${episode.season}-${episode.number}`} label="episode title" context={`${title.name}, season ${episode.season}, episode ${episode.number}`}>{episode.name}</SpoilerContent></p>
                          </div>
                          <button
                            className={`episode-check ${watched ? "selected" : ""}`}
                            aria-label={`${watched ? "Mark unwatched" : "Mark watched"}: ${title.name}, season ${episode.season}, episode ${episode.number}`}
                            aria-pressed={watched}
                            disabled={day > today}
                            onClick={() => onEpisodes(title, episode.season, [episode.number], !watched)}
                          >
                            <Check size={17} />
                            <span>{watched ? "Watched" : day > today ? "Upcoming" : "Mark watched"}</span>
                          </button>
                        </article>
                      ))}
                    {!events.some((e) => e.episode.airDate === day) && (
                      <p className="calendar-empty-day">
                        No {showWatched ? "" : "unwatched "}episodes listed
                      </p>
                    )}
                  </section>
                ))}
            </div>
          )}
          {!busy && !events.length && compact && (
            <p className="section-empty">
              No published episode dates in the next seven days for the series checked.
            </p>
          )}
          {!busy && (
            <p className="fine-print">
              Checked {shown.length} of {ids.length} tracked series.{" "}
              {shown.length < ids.length
                ? "Load more series to include all your dates."
                : "Unannounced dates do not appear."}
            </p>
          )}
          {shown.length < ids.length &&
            (compact ? (
              <button className="text-button" onClick={onViewAll}>
                Check all tracked series <ArrowRight size={14} />
              </button>
            ) : (
              <button className="button secondary" disabled={busy} onClick={() => setLimit((n) => n + 20)}>
                Check 20 more series
              </button>
            ))}
        </>
      )}
    </section>
  );
}
