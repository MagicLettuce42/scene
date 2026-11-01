"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import { cachedJSON, readCache } from "../../lib/client-cache";
import { halloweenPageTitles, loadHalloweenBatches, type HalloweenPage } from "../../lib/halloween-loading";
import { filterTitles, type Title } from "../../lib/catalogue";
import { extraParams, matchesExtra, type ExtraFilters } from "../../lib/catalogue-filters";
import { halloweenCatalogueVersion, halloweenMoods, type HalloweenMood } from "../../lib/halloween";
import { visibleSuggestions } from "../../lib/preferences";
import { TitleCard, Skeletons, type CardActions } from "./catalogue-cards";

type Data = HalloweenPage;
export default function Halloween({
  genre,
  extra,
  hideWatched,
  onGenres,
  onFilters,
  filtersExpanded,
  filtersActive,
  ...actions
}: CardActions & {
  genre: string;
  extra: ExtraFilters;
  hideWatched: boolean;
  onGenres: (genres: string[]) => void;
  onFilters: () => void;
  filtersExpanded: boolean;
  filtersActive: boolean;
}) {
  const [mood, setMood] = useState<HalloweenMood>("all");
  const query = new URLSearchParams({
    section: "halloween",
    v: halloweenCatalogueVersion,
    mood,
    services: [...actions.selected].sort().join(","),
    offer: actions.offer,
    genre,
    ...extraParams(extra),
  });
  const url = "/api/discover?" + query;
  const [state, setState] = useState<{ url: string; pages: Data[]; error: string; busy: boolean; attempt: number }>({
    url: "",
    pages: [],
    error: "",
    busy: true,
    attempt: 0,
  });
  const request = useRef<AbortController | null>(null),
    latestState = useRef(state),
    visibleTitles = useRef((titles: Title[]) => titles);
  latestState.current = state;
  visibleTitles.current = (titles) => visibleSuggestions(
    filterTitles(titles, {
      kind: "all", genre, provider: "all", mine: true,
      selected: actions.selected, offer: actions.offer,
    }), actions.feedback, hideWatched,
  ).filter((title) => matchesExtra(title, extra));
  const load = useCallback(async (page: number, force = false) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const cached = readCache<Data>(url + "&page=" + page),
      previous = latestState.current.url === url ? latestState.current.pages : cached && page === 0 ? [cached] : [];
    setState({ url, pages: previous, error: "", busy: true, attempt: page });
    try {
      await loadHalloweenBatches({
        page, previous, signal: controller.signal, force,
        countVisible: (titles) => visibleTitles.current(titles).length,
        request: (next, signal, refresh) => {
          const nextUrl = url + "&page=" + next;
          return cachedJSON<Data>(nextUrl, signal, refresh || Boolean(readCache<Data>(nextUrl)?.message));
        },
        onAttempt: (attempt) => setState((previous) => previous.url === url ? { ...previous, attempt } : previous),
        onPage: (pages) => setState((previous) => previous.url === url ? { ...previous, pages } : previous),
      });
    } catch (error) {
      if (!controller.signal.aborted)
        setState((previous) => previous.url === url ? { ...previous, error: (error as Error).message, busy: false } : previous);
    } finally {
      if (!controller.signal.aborted)
        setState((previous) => previous.url === url ? { ...previous, busy: false } : previous);
    }
  }, [url]);
  useEffect(() => {
    void load(0);
    return () => request.current?.abort();
  }, [load]);
  useEffect(() => {
    if (state.url === url && state.pages.length)
      onGenres([...new Set(state.pages.flatMap((page) => page.genres))].sort());
  }, [state.url, state.pages, url, onGenres]);
  const pages = state.url === url ? state.pages : [],
    lastPage = pages.at(-1),
    incomplete = pages.find((page) => page.message),
    retryPage = state.error ? state.attempt : incomplete?.page ?? 0;
  const busy = state.url !== url || state.busy;
  const items = visibleTitles.current(halloweenPageTitles(pages));
  return (
    <section className="halloween-section" aria-labelledby="halloween-heading">
      <div className="halloween-heading">
        <div>
          <h3 id="halloween-heading">🎃 Halloween picks</h3>
          <p>Find a little fright on your services.</p>
        </div>
        <button
          className={`filter-button ${filtersExpanded ? "active" : ""}`}
          onClick={onFilters}
          aria-expanded={filtersExpanded}
          aria-controls="catalogue-filters"
        >
          <SlidersHorizontal size={16} /> Filters {filtersActive && <span className="active-dot" />}
        </button>
      </div>
      <div className="halloween-categories" role="group" aria-label="Halloween category">
        {halloweenMoods.map((category) => (
          <button
            key={category.id}
            className={category.id === mood ? "active" : ""}
            aria-pressed={category.id === mood}
            onClick={() => setMood(category.id)}
          >
            {category.label}
          </button>
        ))}
      </div>
      <div aria-busy={busy}>
        {busy && !pages.length ? (
          <Skeletons row />
        ) : items.length ? (
          <div className="discovery-row">
            {items.map((title) => <TitleCard key={title.id} title={title} {...actions} />)}
          </div>
        ) : !state.error ? (
          <p className="section-empty">
            {busy ? "Looking for more matches on your services…" : (
              <>No matches in this category on your services with these filters. Try another category,
                {lastPage?.hasMore ? " load more films," : ""} include watched titles, or update My services.</>
            )}
          </p>
        ) : null}
      </div>
      {state.url === url && state.error && (
        <div className="error-notice" role="alert">
          {state.error}
          <button disabled={busy} onClick={() => void load(retryPage, true)}><RotateCcw size={14} /> Retry</button>
        </div>
      )}
      {incomplete && !state.error && (
        <p className="fine-print" role="status">
          {incomplete.message}{" "}
          <button className="text-button" disabled={busy} onClick={() => void load(retryPage, true)}>
            {busy && state.attempt === retryPage ? "Retrying picks…" : "Retry picks"}
          </button>
        </p>
      )}
      {lastPage && (
        <div className="browse-pagination">
          <p role="status">
            {items.length} {items.length === 1 ? "pick" : "picks"} on your services
            {busy && state.attempt > 0 ? " · Looking for more matches…" : ""}
          </p>
          {lastPage.hasMore && (
            <button className="button secondary" disabled={busy} onClick={() => void load(lastPage.page + 1)}>
              {busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}{" "}
              {busy ? "Loading…" : "Load more Halloween films"}
            </button>
          )}
        </div>
      )}
      {mood === "family" && (
        <p className="fine-print halloween-rating-note">
          Some family films still have spooky scenes. Check the age rating with your streaming provider.
        </p>
      )}
    </section>
  );
}
