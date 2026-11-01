"use client";
import { useEffect, useState } from "react";
import { Clock3, RotateCcw } from "lucide-react";
import { cachedJSON } from "../../lib/client-cache";
import type { Title } from "../../lib/catalogue";
import type { EpisodeCatalogue, SeriesProgress } from "../../lib/episodes";
import { seriesGuide, durationLabel } from "../../lib/series-guide";

export default function SeriesGuide({ title, progress }: { title: Title; progress?: SeriesProgress }) {
  const url = title.kind === "series" && title.tmdbId ? `/api/title/tmdb-tv-${title.tmdbId}/episodes` : "";
  const [state, setState] = useState<{ url: string; data?: EpisodeCatalogue; error?: string }>({ url: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!url) return;
    const ac = new AbortController();
    setState({ url });
    cachedJSON<EpisodeCatalogue>(url, ac.signal, retry > 0).then(data => {
      if (!ac.signal.aborted) setState({ url, data });
    }).catch(() => {
      if (!ac.signal.aborted) setState({ url, error: "Series information could not load." });
    });
    return () => ac.abort();
  }, [url, retry]);
  if (!url) return null;
  const data = state.url === url ? state.data : undefined;
  const error = state.url === url ? state.error : undefined;
  const guide = data ? seriesGuide(data, progress, title.runtime) : null;
  return <section className="series-guide" aria-label="Before you start">
    <h3><Clock3 size={19} aria-hidden="true" /> Before you start</h3>
    {error ? <div className="error-notice" role="alert">{error}<button type="button" onClick={() => setRetry(n => n + 1)}><RotateCcw size={14} /> Retry</button></div>
      : !guide ? <p className="fine-print" role="status">Checking series status and length…</p>
      : <>
        <dl className="series-guide-facts">
          <div><dt>Series status</dt><dd>{guide.status}</dd></div>
          <div><dt>Seasons listed</dt><dd>{guide.seasons || "Not listed"}</dd></div>
          <div><dt>Episodes listed</dt><dd>{guide.episodeCount ? `${guide.episodeCount}${guide.countComplete ? "" : "+"}` : "Not listed"}</dd></div>
          <div><dt>Estimated viewing time</dt><dd>{guide.totalMinutes !== null ? `About ${durationLabel(guide.totalMinutes)}` : "Not enough information"}</dd></div>
        </dl>
        {guide.hasProgress && <div className="series-guide-remaining" aria-live="polite">
          <strong>{guide.remaining === 0 ? "All listed episodes watched" : guide.remaining === null ? "Time left is not available yet" : `${guide.remaining} ${guide.remaining === 1 ? "episode" : "episodes"} left${guide.remainingMinutes !== null ? ` · about ${durationLabel(guide.remainingMinutes)}` : ""}`}</strong>
          <span>{guide.watched} marked watched{guide.countComplete ? ` of ${guide.episodeCount}` : ""}</span>
        </div>}
        <p className="fine-print">{guide.runtime ? `Time estimates use ${guide.runtime} minutes per episode; actual lengths vary. ` : "An episode runtime is not listed. "}Counts exclude specials and may include announced future episodes. {guide.countComplete ? "" : "Some episode counts are not available yet. "}TMDB series information does not confirm UK streaming availability.</p>
      </>}
  </section>;
}
