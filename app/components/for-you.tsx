"use client";
import SelectControl from "./select-control";
import {useDiscoverVariety} from "./discover-variety";
import { useEffect, useRef, useState } from "react";
import TasteSetup from "./taste-setup";
import type { RecommendationMode } from "../../lib/filter-presets";
import { useHalloween } from "./seasonal";
import { Sparkles, RotateCcw, Bookmark, ArrowUpRight } from "lucide-react";
import { sceneFetch } from "../../lib/auth/client";
import { sameTitle, type Title } from "../../lib/catalogue";
import { extraParams, type ExtraFilters } from "../../lib/catalogue-filters";
import type { PersonalPick } from "../../lib/personal-recommendations";
import { TitleCard, Skeletons, type CardActions } from "./catalogue-cards";
type Data = { picks: PersonalPick[]; seedCount: number; message: string | null };
export default function ForYou({
  mode = "balanced", onMode, onFavourites,
  likedTitles, syncMessage, storageWarning,
  signature,
  syncStatus,
  exclude,
  genre,
  extra,
  ...actions
}: CardActions & {
  mode?: RecommendationMode; onMode?: (mode: RecommendationMode) => void; onFavourites?: (titles: Title[]) => boolean;
  likedTitles: Title[];
  syncMessage: string;
  storageWarning: boolean;
  signature: string;
  syncStatus: string;
  exclude: Title[];
  genre: string;
  extra: ExtraFilters;
}) {
  const halloween = useHalloween();
  const url =
    "/api/for-you?" +
    new URLSearchParams({
      services: [...actions.selected].sort().join(","),
      offer: actions.offer,
      genre,
      ...extraParams(extra),
    });
  const successful = useRef("");
  const key = url + "|" + signature + "|" + mode,
    [state, setState] = useState<{ key: string; data: Data | null; error: string; busy: boolean }>({
      key: "",
      data: null,
      error: "",
      busy: true,
    }),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (syncStatus !== "saved" || successful.current === key + "|" + retry) return;
    const ac = new AbortController();
    setState({ key, data: null, error: "", busy: true });
    sceneFetch(url, { signal: ac.signal, cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json()) as Data & { error?: string };
        if (!r.ok) throw Error(data.error || "Recommendations could not load.");
        if (!ac.signal.aborted) {
          successful.current = key + "|" + retry;
          setState({ key, data, error: "", busy: false });
        }
      })
      .catch((e) => {
        if (!ac.signal.aborted) setState({ key, data: null, error: e.message, busy: false });
      });
    return () => ac.abort();
  }, [key, syncStatus, retry]);
  const [showAll, setShowAll] = useState(false);
  const data = state.key === key ? state.data : null,
    candidates = data?.picks.filter((p) => !exclude.some((t) => sameTitle(t, p.title))) || [];
  const items=useDiscoverVariety("personal",candidates,p=>p.title,showAll?100:6);
  return (
    <section className="discover-section for-you" aria-labelledby="for-you-heading">
      <div className="discover-heading">
        <div>
          <h3 id="for-you-heading">
            <Sparkles size={18} /> For you
          </h3>
          <p>Fresh suggestions from your likes and ratings, on your services.</p>
        </div>
        {candidates.length > 6 && <button className="text-button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : "See all"}</button>}
      </div>
      {syncStatus !== "saved" && !data ? (
        <p className="section-empty">
          {syncStatus === "offline"
            ? "Connect to see personal recommendations."
            : "Recommendations will update when your library has synced."}
        </p>
      ) : state.key !== key || state.busy ? (
        <Skeletons row />
      ) : state.error ? (
        <div className="error-notice" role="alert">
          {state.error}
          <button onClick={() => setRetry((n) => n + 1)}>
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      ) : !data?.seedCount ? (
        <p className="section-empty">
          Like a film or series, or give it four or five stars, to start your personal recommendations. Open
          any title to add your rating.
        </p>
      ) : items.length ? (
        <>
        {!halloween && <article className="featured-pick">
          <button className="featured-pick-open" onClick={() => actions.onOpen(items[0].title)} aria-label={`View ${items[0].title.name}`}>
            {(items[0].title.backdrop || items[0].title.poster) && <img src={items[0].title.backdrop || items[0].title.poster!} alt="" />}
            <span className="featured-pick-copy"><strong>{items[0].title.name}</strong><small>{items[0].reason}</small><span>View details <ArrowUpRight size={16}/></span></span>
          </button>
          <button className="save-button" aria-label={`${actions.isSaved(items[0].title) ? "Remove" : "Save"} ${items[0].title.name}`} aria-pressed={actions.isSaved(items[0].title)} onClick={() => actions.onSave(items[0].title)}><Bookmark size={18} fill={actions.isSaved(items[0].title)?"currentColor":"none"}/></button>
        </article>}
        <div className="discovery-row">
          {(showAll ? items : items.slice(0, 6)).slice(halloween ? 0 : 1).map((p) => (
            <div className="personal-pick" key={p.title.id}>
              <TitleCard title={p.title} {...actions} />
              <p className="recommendation-reason">{p.reason}</p>
            </div>
          ))}
        </div>
        </>
      ) : (
        <p className="section-empty">
          No fresh matches on your services with these filters. Try another genre, clear extra filters, or
          like a few more titles.
        </p>
      )}
      <details className="recommendation-settings"><summary>Tune your recommendations</summary><div className="recommendation-controls">
        {onMode && <label>Suggestions<SelectControl value={mode} onChange={e => onMode(e.target.value as RecommendationMode)}>
          <option value="balanced">A mix for me</option><option value="familiar">Familiar favourites</option><option value="adventurous">Something different</option>
        </SelectControl></label>}
        {onFavourites && <TasteSetup onSave={onFavourites} likedTitles={likedTitles} syncStatus={syncStatus} syncMessage={syncMessage} storageWarning={storageWarning} />}
      </div></details>
      {data?.message && (
        <p className="fine-print">
          {data.message}{" "}
          <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </p>
      )}
    </section>
  );
}
