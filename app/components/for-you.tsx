"use client";
import SelectControl from "./select-control";
import {useDiscoverVariety} from "./discover-variety";
import { useEffect, useRef, useState } from "react";
import TasteSetup from "./taste-setup";
import type { RecommendationMode } from "../../lib/filter-presets";
import { Sparkles, RotateCcw } from "lucide-react";
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
  const url =
    "/api/for-you?" +
    new URLSearchParams({
      services: [...actions.selected].sort().join(","),
      offer: actions.offer,
      genre,
      ...extraParams(extra),
    });
  const successful = useRef(""), lastAttempt = useRef(0), inFlight = useRef(false), synced = useRef(false);
  synced.current = syncStatus === "saved";
  const key = url + "|" + signature + "|" + mode,
    [state, setState] = useState<{ key: string; data: Data | null; error: string; busy: boolean; checkedAt: number }>({
      key: "",
      data: null,
      error: "",
      busy: true,
      checkedAt: 0,
    }),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (syncStatus !== "saved" || (successful.current === key + "|" + retry && state.key === key && state.data)) return;
    const ac = new AbortController();
    inFlight.current = true;
    lastAttempt.current = Date.now();
    setState(old => ({ key, data: old.key === key ? old.data : null, error: "", busy: true, checkedAt: old.key === key ? old.checkedAt : 0 }));
    sceneFetch(url, { signal: AbortSignal.any([ac.signal, AbortSignal.timeout(45000)]), cache: "no-store" })
      .then(async (r) => {
        const data = (await r.json()) as Data & { error?: string };
        if (!r.ok) throw Error(data.error || "Recommendations could not load.");
        if (!ac.signal.aborted) {
          successful.current = key + "|" + retry;
          setState({ key, data, error: "", busy: false, checkedAt: Date.now() });
        }
      })
      .catch((e) => {
        if (!ac.signal.aborted) setState(old => ({ ...old, error: "Suggestions could not refresh. Please try again.", busy: false }));
      })
      .finally(() => { if (!ac.signal.aborted) inFlight.current = false; });
    return () => { ac.abort(); inFlight.current = false; };
  }, [key, syncStatus, retry]);
  useEffect(() => {
    const refresh = () => {
      if (!synced.current || inFlight.current || document.visibilityState !== "visible" || navigator.onLine === false || Date.now() - lastAttempt.current < 15 * 60 * 1000) return;
      lastAttempt.current = Date.now();
      setRetry(n => n + 1);
    };
    const timer = setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); };
  }, []);
  const [showAll, setShowAll] = useState(false);
  const data = state.key === key ? state.data : null,
    candidates = data?.picks.filter((p) => !exclude.some((t) => sameTitle(t, p.title))) || [];
  const items=useDiscoverVariety("personal",candidates,p=>p.title,showAll?100:5);
  return (
    <section className="discover-section for-you" aria-labelledby="for-you-heading">
      <div className="discover-heading">
        <div>
          <h3 id="for-you-heading">
            <Sparkles size={18} /> For you
          </h3>
          <p>Suggestions from your likes and ratings, on your services.</p>
        </div>
        {candidates.length > 5 && <button className="text-button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : "See all"}</button>}
      </div>
      {syncStatus !== "saved" && !data ? (
        <p className="section-empty">
          {syncStatus === "offline"
            ? "Connect to see personal recommendations."
            : "Recommendations will update when your library has synced."}
        </p>
      ) : !data && (state.key !== key || state.busy) ? (
        <Skeletons row />
      ) : !data && state.error ? (
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
        <div className="discovery-row">
          {(showAll ? items : items.slice(0, 5)).map((p) => (
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
      {data && state.busy && <p className="fine-print" role="status">Updating your suggestions…</p>}
      {data && state.error && <p className="fine-print" role="alert">{state.error} Your previous suggestions are still shown. <button className="text-button" onClick={() => setRetry(n => n + 1)}>Retry</button></p>}
      <details className="recommendation-settings"><summary>Tune your recommendations</summary><div className="recommendation-controls">
        <p className="fine-print">Updates after your favourites, likes, ratings or services sync. Scene also rechecks while you’re here. The same preferences can produce the same suggestions.{state.key === key && state.checkedAt > 0 ? ` Last checked ${new Date(state.checkedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : ""}</p>
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
