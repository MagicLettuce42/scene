"use client";
import { useDiscoverVariety } from "./discover-variety";
import { useEffect, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { cachedJSON, readCache } from "../../lib/client-cache";
import { filterTitles, type Title } from "../../lib/catalogue";
import { extraParams, matchesExtra, type ExtraFilters } from "../../lib/catalogue-filters";
import { visibleSuggestions } from "../../lib/preferences";
import { TitleCard, Skeletons, type CardActions } from "./catalogue-cards";
const sections = [
  {
    id: "popular",
    name: "Selected for your evening",
    description: "Films and series on your selected services.",
    view: "films",
    sort: "recommended",
  },
  {
    id: "rated",
    name: "Highly rated films",
    description: "Audience favourites with at least 200 TMDB votes.",
    view: "films",
    sort: "rating",
  },
  {
    id: "recent",
    name: "Recent releases",
    description: "Films released in the last year and available on your services.",
    view: "films",
    sort: "newest",
  },
  {
    id: "short",
    name: "100 minutes or less",
    description: "A film that fits into your evening.",
    view: "films",
    sort: "recommended",
  },
];
type Data = { titles: Title[]; message: string | null; genres: string[] };
function DiscoverSection({
  section,
  hideWatched,
  genre,
  onGenres,
  extra,
  ...actions
}: CardActions & {
  section: (typeof sections)[number];
  hideWatched: boolean;
  genre: string;
  extra: ExtraFilters;
  onGenres: (genres: string[]) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const query = new URLSearchParams({
      section: section.id,
      services: [...actions.selected].sort().join(","),
      offer: actions.offer,
      genre,
      ...extraParams(extra),
    }),
    url = "/api/discover?" + query;
  const [state, setState] = useState<{ url: string; data: Data | null; error: string; busy: boolean }>({
      url: "",
      data: null,
      error: "",
      busy: true,
    }),
    [retry, setRetry] = useState(0);
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
  useEffect(() => {
    if (state.url === url && state.data?.genres) onGenres(state.data.genres);
  }, [state.data, url, section.id, onGenres]);
  const active = state.url === url,
    data = active ? state.data : null,
    candidates = visibleSuggestions(
      filterTitles(data?.titles || [], {
        kind: "all",
        genre,
        offer: actions.offer,
        provider: "all",
        mine: true,
        selected: actions.selected,
      }),
      actions.feedback,
      hideWatched,
    ).filter((t) => matchesExtra(t, extra));
  const items=useDiscoverVariety(section.id,candidates,t=>t,showAll?100:5);
  if(candidates.length && !items.length)return null;
  return (
    <section className="discover-section" aria-labelledby={"discover-" + section.id}>
      <div className="discover-heading">
        <div>
          <h3 id={"discover-" + section.id}>{section.name}</h3>
          <p>{section.description}</p>
        </div>
        {candidates.length > 5 && <button className="text-button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : "See all"}</button>}
      </div>
      {(!active || state.busy) && !data ? (
        <Skeletons row />
      ) : state.error ? (
        <div className="error-notice" role="alert">
          {state.error}
          <button onClick={() => setRetry((n) => n + 1)}>
            <RotateCcw size={14} /> Retry
          </button>
        </div>
      ) : items.length ? (
        <div className="discovery-row">
          {(showAll ? items : items.slice(0, 5)).map((t) => (
            <TitleCard key={t.id} title={t} {...actions} />
          ))}
        </div>
      ) : (
        <p className="section-empty">
          No new matches here. Try another genre, include watched titles, or update My services.
        </p>
      )}
      {data?.message && (
        <p className="fine-print">
          {data.message}
          <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
            Retry section <ArrowRight size={13} />
          </button>
        </p>
      )}
    </section>
  );
}
export default function Discover({
  sectionId,
  ...props
}: CardActions & {
  sectionId?: string;
  hideWatched: boolean;
  genre: string;
  extra: ExtraFilters;
  onGenres: (genres: string[]) => void;
}) {
  return (
    <div className="discover-sections">
      {sections
        .filter((s) => !sectionId || s.id === sectionId)
        .map((section) => (
          <DiscoverSection key={section.id} section={section} {...props} />
        ))}
    </div>
  );
}
