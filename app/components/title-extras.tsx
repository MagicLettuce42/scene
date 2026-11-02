"use client";
import PersonPortrait from "./person-portrait";
import type { Person } from "../../lib/people";
import { useEffect, useState, type ReactNode } from "react";
import { Play, Star, RotateCcw } from "lucide-react";
import { cachedJSON } from "../../lib/client-cache";
import { type Title, type TitleExtras } from "../../lib/catalogue";
import { visibleSuggestions } from "../../lib/preferences";
import { TitleCard, type CardActions } from "./catalogue-cards";
export default function TitleExtrasPanel({
  title,
  hideWatched,
  onPerson,
  children,
  ...actions
}: CardActions & {
  title: Title;
  hideWatched: boolean;
  onPerson: (person: Person) => void;
  children?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id =
      title.tmdbId && actions.selected.length
        ? `tmdb-${title.kind === "movie" ? "movie" : "tv"}-${title.tmdbId}`
        : "",
    key = id
      ? "/api/title/" +
        id +
        "/extras?" +
        new URLSearchParams({ services: [...actions.selected].sort().join(","), offer: actions.offer })
      : "";
  const url = key.trim();
  const [state, setState] = useState<{ url: string; data: TitleExtras | null; error: string }>({
      url: "",
      data: null,
      error: "",
    }),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!url || !expanded) return;
    const controller = new AbortController();
    setState({ url, data: null, error: "" });
    cachedJSON<TitleExtras>(url, controller.signal, retry > 0)
      .then((data) => {
        if (!controller.signal.aborted) setState({ url, data, error: "" });
      })
      .catch((e) => {
        if (!controller.signal.aborted) setState({ url, data: null, error: e.message });
      });
    return () => controller.abort();
  }, [url, retry, expanded]);
  const data = state.url === url ? state.data : null,
    related = visibleSuggestions(data?.recommendations || [], actions.feedback, hideWatched);
  return (
    <>
      {children}
      {url && <details className="title-extras-disclosure" onToggle={e => setExpanded(e.currentTarget.open)}>
        <summary>Trailer, cast & similar titles</summary>
      {expanded && (
        <div className="title-extras">
          {title.dataSource === "tmdb" && Boolean(title.rating) && (
            <p className="detail-rating">
              <Star size={18} />
              <strong>{title.rating!.toFixed(1)} / 10</strong>
              <span>
                TMDB audience rating
                {title.voteCount ? ` · ${title.voteCount.toLocaleString("en-GB")} votes` : ""}
              </span>
            </p>
          )}
          {state.url === url && state.error ? (
            <div className="error-notice">
              {state.error}
              <button onClick={() => setRetry((n) => n + 1)}>
                <RotateCcw size={14} /> Retry extras
              </button>
            </div>
          ) : !data ? (
            <p className="fine-print" role="status">
              Loading trailer, cast and similar titles…
            </p>
          ) : (
            <>
              {data.trailer ? (
                <a
                  className="button secondary trailer-button"
                  href={data.trailer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Play size={17} /> Watch trailer{" "}
                  <span className="trailer-host">
                    {data.trailer.url.includes("youtube.com") ? "YouTube" : "Vimeo"}
                  </span>
                </a>
              ) : (
                <p className="fine-print">No trailer is available for this title.</p>
              )}
              <h3>Cast</h3>
              {data.cast.length ? (
                <div className="cast-list">
                  {data.cast.map((p) => (
                    <button
                      className="cast-person"
                      key={p.id}
                      onClick={() => onPerson({ ...p, department: "Acting" })}
                    >
                      <PersonPortrait name={p.name} photo={p.photo} decorative />
                      <strong>{p.name}</strong>
                      <span>{p.character}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="fine-print">Cast information is not available.</p>
              )}
              {Boolean(data.directors?.length) && (
                <>
                  <h3>Directed by</h3>
                  <div className="director-list">
                    {data.directors!.map((p) => (
                      <button className="button secondary" key={p.id} onClick={() => onPerson(p)}>
                        {p.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
      {expanded && data && (
        <div className="title-extras">
          <div className="related-heading">
            <h3>More like this</h3>
            <p>Available on your services</p>
          </div>
          {related.length ? (
            <div className="discovery-row related-row">
              {related.map((t) => (
                <TitleCard key={t.id} title={t} {...actions} />
              ))}
            </div>
          ) : (
            <p className="fine-print">No similar titles match your services and preferences right now.</p>
          )}
          {data.message && (
            <p className="fine-print">
              {data.message}
              <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
                Retry
              </button>
            </p>
          )}
        </div>
      )}
      </details>}
    </>
  );
}
