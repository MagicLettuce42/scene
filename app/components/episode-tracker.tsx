"use client";
import SelectControl from "./select-control";
import { useEffect, useState } from "react";
import { Check, Play, RotateCcw, MonitorPlay } from "lucide-react";
import SpoilerContent, { SpoilerSettings } from "./spoiler-content";
import { type Title } from "../../lib/catalogue";
import { cachedJSON } from "../../lib/client-cache";
import {
  episodeWatched,
  episodeReleased,
  firstIncompleteSeason,
  type EpisodeCatalogue,
  type SeriesProgress,
} from "../../lib/episodes";
export type EpisodeActions = {
  onTrack: (title: Title, value: boolean) => void;
  onEpisodes: (title: Title, season: number, episodes: number[], value: boolean) => void;
};
export default function EpisodeTracker({
  title,
  progress,
  spoilerFree = false,
  onSpoilerFreeChange,
  onTrack,
  onEpisodes,
}: EpisodeActions & { title: Title; progress?: SeriesProgress; spoilerFree?: boolean; onSpoilerFreeChange?: (value: boolean) => void }) {
  const [expanded, setExpanded] = useState(Boolean(progress?.tracking)),
    [catalogue, setCatalogue] = useState<EpisodeCatalogue | null>(null),
    [season, setSeason] = useState<number | null>(null),
    [data, setData] = useState<EpisodeCatalogue | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [limit, setLimit] = useState(50);
  const id = title.kind === "series" ? title.tmdbId : null,
    url = id ? `/api/title/tmdb-tv-${id}/episodes` : "";
  useEffect(() => {
    if (!expanded || !url) return;
    const ac = new AbortController();
    setError("");
    cachedJSON<EpisodeCatalogue>(url, ac.signal, retry > 0)
      .then((d) => {
        if (ac.signal.aborted) return;
        setCatalogue(d);
        setSeason(
          (v) =>
            v ??
            firstIncompleteSeason(d.seasons, progress)?.number ??
            d.seasons.find((s) => s.number > 0)?.number ??
            d.seasons[0]?.number ??
            null,
        );
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e.message);
      });
    return () => ac.abort();
  }, [expanded, url, retry]);
  useEffect(() => {
    if (!expanded || !url || season === null) return;
    const ac = new AbortController();
    setData(null);
    setError("");
    setLimit(50);
    cachedJSON<EpisodeCatalogue>(url + "?season=" + season, ac.signal, retry > 0)
      .then((d) => {
        if (!ac.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e.message);
      });
    return () => ac.abort();
  }, [expanded, url, season, retry]);
  if (!id) return null;
  const episodes = data?.season === season ? data.episodes || [] : [],
    watched = episodes.filter((e) => episodeWatched(progress, season!, e.number)).length;
  function setEpisodes(numbers: number[], value: boolean, s = season!) {
    onEpisodes(title, s, numbers, value);
  }
  const aired = episodes
    .filter((e) => e.airDate && episodeReleased(e) && !episodeWatched(progress, season!, e.number))
    .map((e) => e.number);
  return (
    <section className="episode-tracker">
      <button className="episode-toggle" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        <span>
          <MonitorPlay size={20} />
          <strong>Your episode progress</strong>
        </span>
        <span>{expanded ? "Hide" : "Track episodes"}</span>
      </button>
      {expanded && (
        <div className="episode-body">
          <p className="fine-print">
            Mark what you’ve watched here. Scene doesn’t read playback from streaming apps. This history stays
            private. TMDB air dates may differ from regional streaming availability.
          </p>
          {onSpoilerFreeChange && <SpoilerSettings enabled={spoilerFree} onChange={onSpoilerFreeChange} />}
          <button
            className={`button secondary ${progress?.tracking ? "saved" : ""}`}
            aria-pressed={Boolean(progress?.tracking)}
            onClick={() => onTrack(title, !progress?.tracking)}
          >
            {progress?.tracking ? <Check size={16} /> : <Play size={16} />}{" "}
            {progress?.tracking ? "In your Watching list" : "Start tracking"}
          </button>
          {progress?.tracking && (
            <button className="text-button" onClick={() => onTrack(title, false)}>
              Stop tracking · keep progress
            </button>
          )}
          {catalogue?.seasons.length ? (
            <label className="season-select">
              Season
              <SelectControl
                value={season ?? ""}
                onChange={(e) => {
                  setSeason(Number(e.target.value));
                }}
              >
                {catalogue.seasons.map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.number === 0 ? "Specials" : s.name} · {s.episodeCount} episodes
                  </option>
                ))}
              </SelectControl>
            </label>
          ) : catalogue && !catalogue.seasons.length ? (
            <p className="fine-print">No seasons have been listed yet.</p>
          ) : (
            !error && <p role="status">Loading seasons…</p>
          )}
          {error && (
            <div className="error-notice" role="alert">
              {error}
              <button onClick={() => setRetry((n) => n + 1)}>
                <RotateCcw size={14} /> Retry
              </button>
            </div>
          )}
          {season !== null && !data && !error && <p role="status">Loading episodes…</p>}
          {data && (
            <>
              <div className="episode-season-progress">
                <strong>
                  {watched} of {episodes.length} watched
                </strong>
                <progress max={Math.max(1, episodes.length)} value={watched} aria-label="Season progress" />
              </div>
              <div className="inline-actions">
                <button
                  className="text-button"
                  disabled={!aired.length}
                  onClick={() => {
                    setEpisodes(aired, true);
                  }}
                >
                  <Check size={15} /> Mark aired episodes watched
                </button>
              </div>
              <p className="fine-print">
                Future episodes can’t be marked yet. Episodes with no air date can be marked individually.
              </p>
              <div className="episode-list">
                {episodes.slice(0, limit).map((e) => {
                  const done = episodeWatched(progress, season!, e.number),
                    released = episodeReleased(e);
                  return (
                    <div
                      key={e.number}
                      className={`episode-row ${done ? "watched" : ""} ${!released ? "upcoming" : ""}`}
                    >
                      <label className="episode-checkbox">
                      <input
                        aria-label={`Mark ${done ? "unwatched" : "watched"}: season ${season}, episode ${e.number}`}
                        type="checkbox"
                        checked={done}
                        disabled={!released && !done}
                        onChange={() => {
                          setEpisodes([e.number], !done);
                        }}
                      />
                      </label>
                      <span>
                        <strong>
                          {e.number}. <SpoilerContent hidden={spoilerFree && !done} identity={`${title.id}-${season}-${e.number}`} label="episode title" context={`Season ${season}, episode ${e.number}`}>{e.name}</SpoilerContent>
                        </strong>
                        <small>
                          {e.airDate
                            ? `${released ? "Aired" : "Expected"} ${new Date(e.airDate + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                            : "Air date not listed"}
                          {e.runtime ? ` · ${e.runtime} min` : ""}
                        </small>
                      </span>
                      {done && <Check size={17} />}
                    </div>
                  );
                })}
              </div>
              {!episodes.length && (
                <p className="fine-print">No episodes have been listed for this season yet.</p>
              )}
              {episodes.length > limit && (
                <button className="button secondary" onClick={() => setLimit((n) => n + 50)}>
                  Show more episodes
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
