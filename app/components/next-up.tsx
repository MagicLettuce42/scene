"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Play, ArrowRight, RotateCcw } from "lucide-react";
import { type Title } from "../../lib/catalogue";
import { cachedJSON } from "../../lib/client-cache";
import {
  firstIncompleteSeason,
  allEpisodesWatched,
  nextEpisode,
  episodeReleased,
  type EpisodeCatalogue,
  type SeriesProgress,
} from "../../lib/episodes";
import { type EpisodeActions } from "./episode-tracker";
import SpoilerContent from "./spoiler-content";
import { Poster } from "./catalogue-cards";
type Tracked = { title: Title; progress: SeriesProgress };
type OnCatalogue = (id: string, catalogue: EpisodeCatalogue) => void;
function NextCard({
  item,
  onOpen,
  onEpisodes,
  spoilerFree = false,
  initialCatalogue,
  onCatalogue,
  compact = false,
}: Pick<EpisodeActions, "onEpisodes"> & {
  item: Tracked;
  onOpen: (t: Title) => void;
  spoilerFree?: boolean;
  compact?: boolean;
  initialCatalogue?: EpisodeCatalogue;
  onCatalogue: OnCatalogue;
}) {
  const { title, progress } = item,
    url = `/api/title/tmdb-tv-${title.tmdbId}/episodes`;
  const [catalogue, setCatalogue] = useState<EpisodeCatalogue | null>(initialCatalogue || null),
    [data, setData] = useState<EpisodeCatalogue | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    setError("");
    cachedJSON<EpisodeCatalogue>(url, ac.signal, retry > 0)
      .then((d) => {
        if (!ac.signal.aborted) {
          setCatalogue(d);
          onCatalogue(title.id, d);
        }
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e.message);
      });
    return () => ac.abort();
  }, [url, retry, title.id, onCatalogue]);
  const season = catalogue ? firstIncompleteSeason(catalogue.seasons, progress) : null;
  useEffect(() => {
    if (!season) return;
    const ac = new AbortController();
    setData(null);
    cachedJSON<EpisodeCatalogue>(url + "?season=" + season.number, ac.signal, retry > 0)
      .then((d) => {
        if (!ac.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e.message);
      });
    return () => ac.abort();
  }, [url, season?.number, retry]);
  const episode =
    season && data?.season === season.number
      ? nextEpisode(data.episodes || [], season.number, progress)
      : null;
  if (catalogue && allEpisodesWatched(catalogue.seasons, progress)) return null;
  return (
    <article className="next-card">
      <button className="next-poster" onClick={() => onOpen(title)} aria-label={`Open ${title.name}`}>
        <Poster title={title} />
      </button>
      <div>
        <button className="shared-title" onClick={() => onOpen(title)}>
          {title.name}
        </button>
        {error ? (
          <p className="fine-print">
            Couldn’t load the next episode.{" "}
            <button
              className="text-button"
              onClick={() => {
                setError("");
                setRetry((n) => n + 1);
              }}
            >
              <RotateCcw size={14} /> Retry
            </button>
          </p>
        ) : !catalogue || (season && data?.season !== season.number) ? (
          <p className="fine-print" role="status">
            Finding your next episode…
          </p>
        ) : episode ? (
          <>
            <p className="next-episode">
              {episodeReleased(episode) ? "Next up" : "Coming up"}: Season {season!.number}, Episode{" "}
              {episode.number}
            </p>
            <p className="fine-print">
              <SpoilerContent hidden={spoilerFree} identity={`${title.id}-${season!.number}-${episode.number}`} label="episode title" context={`${title.name}, season ${season!.number}, episode ${episode.number}`}>{episode.name}</SpoilerContent>
              {!episodeReleased(episode) && episode.airDate
                ? ` · Expected ${new Date(episode.airDate + "T12:00:00Z").toLocaleDateString("en-GB")}`
                : ""}
              {!episode.airDate ? " · Air date not listed" : ""}
            </p>
          </>
        ) : (
          <p className="next-episode">
            {season || catalogue.seasons.some((s) => s.number > 0 && s.episodeCount)
              ? "No next episode details listed yet"
              : "No episodes listed yet"}
          </p>
        )}
        {(!compact || (!error && episode && episodeReleased(episode))) && <div className="next-card-actions">
          {!error && episode && (!compact || episodeReleased(episode)) && (
            <button
              className="button secondary"
              disabled={!episodeReleased(episode)}
              onClick={() => onEpisodes(title, season!.number, [episode.number], true)}
            >
              <Check size={15} /> Mark watched
            </button>
          )}
          {!compact && <button className="text-button" onClick={() => onOpen(title)}>
            View episodes & watch options <ArrowRight size={14} />
          </button>}
        </div>}
      </div>
    </article>
  );
}
export default function NextUp({
  items,
  onOpen,
  onEpisodes,
  spoilerFree = false,
  compact = false,
  onViewAll,
}: {
  items: Tracked[];
  onOpen: (t: Title) => void;
  onEpisodes: EpisodeActions["onEpisodes"];
  spoilerFree?: boolean;
  compact?: boolean;
  onViewAll?: () => void;
}) {
  const [limit, setLimit] = useState(12);
  const [catalogues, setCatalogues] = useState<Record<string, EpisodeCatalogue>>({});
  const onCatalogue = useCallback<OnCatalogue>((id, catalogue) => {
    setCatalogues((previous) => (previous[id] === catalogue ? previous : { ...previous, [id]: catalogue }));
  }, []);
  const isCaughtUp = (item: Tracked) => {
    const catalogue = catalogues[item.title.id];
    return catalogue && allEpisodesWatched(catalogue.seasons, item.progress);
  };
  // Filter before limiting, so caught-up series never occupy the available Next up slots.
  const pending = items.filter((item) => !isCaughtUp(item));
  const caughtUp = items.filter(isCaughtUp);
  const shown = pending.slice(0, compact ? 3 : limit);
  if (compact && !pending.length) return null;
  return (
    <section className="next-up" aria-label="Next episodes">
      {compact && (
        <div className="next-up-heading">
          <h3>
            <Play size={18} /> Next up
          </h3>
          <button className="text-button" onClick={onViewAll}>
            Watching list <ArrowRight size={15} />
          </button>
        </div>
      )}
      {pending.length ? (
        <>
          <div className="next-up-grid">
            {shown.map((item) => (
              <NextCard
                key={item.title.id}
                item={item}
                spoilerFree={spoilerFree}
                compact={compact}
                onOpen={onOpen}
                onEpisodes={onEpisodes}
                initialCatalogue={catalogues[item.title.id]}
                onCatalogue={onCatalogue}
              />
            ))}
          </div>
          {!compact && pending.length > limit && (
            <button className="button secondary" onClick={() => setLimit((n) => n + 12)}>
              Show more series
            </button>
          )}
        </>
      ) : (
        <div className="quiet-empty">
          <Play size={30} />
          <h3>{items.length ? "You’re all caught up" : "Keep your place in every series"}</h3>
          <p>
            {items.length
              ? "New listed episodes will appear here. Your tracking and watch history are saved."
              : "Open a TV series and choose “Track episodes”. Your next unwatched episode will appear here."}
          </p>
        </div>
      )}
      {!compact && caughtUp.length > 0 && (
        <details className="caught-up-series">
          <summary>Caught-up series ({caughtUp.length})</summary>
          <p className="fine-print">Still tracking these series. Open one to view or change your progress.</p>
          <div className="next-card-actions">
            {caughtUp.map(({ title }) => (
              <button key={title.id} className="text-button" onClick={() => onOpen(title)}>
                {title.name} <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
