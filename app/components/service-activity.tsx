"use client";
import { clientRegion } from "../../lib/region-client";
import {useDiscoverVariety} from "./discover-variety";
import { useEffect, useState } from "react";
import { cachedJSON } from "../../lib/client-cache";
import { services } from "../../lib/catalogue";
import { visibleSuggestions } from "../../lib/preferences";
import { matchesExtra, type ExtraFilters } from "../../lib/catalogue-filters";
import { releaseDateText } from "../../lib/upcoming";
import type { ActivityData, ActivityMode } from "../../lib/service-activity";
import { TitleCard, Skeletons, type CardActions } from "./catalogue-cards";
export default function ServiceActivity({
  mode,
  genre,
  extra,
  hideWatched,
  ...actions
}: CardActions & { mode: ActivityMode; genre: string; extra: ExtraFilters; hideWatched: boolean }) {
  const url =
    "/api/services/activity?" +
    new URLSearchParams({ mode, services: [...actions.selected].sort().join(",") });
  const [state, setState] = useState<{ url: string; data: ActivityData | null; error: string }>({
      url: "",
      data: null,
      error: "",
    }),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ url, data: null, error: "" });
    cachedJSON<ActivityData>(url, controller.signal, retry > 0)
      .then((data) => setState({ url, data, error: "" }))
      .catch((e) => {
        if (!controller.signal.aborted) setState({ url, data: null, error: e.message });
      });
  return () => controller.abort();
  }, [url, retry]);
  const [showAll, setShowAll] = useState(false);
  const data = state.url === url ? state.data : null,
    error = state.url === url ? state.error : "",
    visible = new Set(
      visibleSuggestions(data?.items.map((i) => i.title) || [], actions.feedback, hideWatched)
        .filter((t) => (genre === "all" || t.genres.includes(genre)) && matchesExtra(t, extra))
        .map((t) => t.id),
    ),
    candidates = data?.items.filter((i) => visible.has(i.title.id)) || [];
  const items=useDiscoverVariety(mode==="new"?"arrivals":"leaving",candidates,item=>item.title,showAll?100:6);
  if(candidates.length && !items.length)return null;
  if (clientRegion() === "US") return <section className="discover-section"><h3>{mode === "new" ? "New on your services" : "Leaving soon"}</h3><p>US {mode === "new" ? "arrival announcements" : "leaving dates"} are not covered yet. Browse and search show current availability on your US services.</p></section>;
  return (
    <section className="discover-section service-activity" aria-labelledby={"service-" + mode}>
      <div className="discover-heading">
        <div>
          <h3 id={"service-" + mode}>{mode === "new" ? "New on your services" : "Leaving soon"}</h3>
          <p>
            {mode === "new"
              ? "Films, new series and returning seasons that arrived in the past 7 days."
              : "Confirmed last days to watch on your services in the next 30 days."}
          </p>
        </div>
        {items.length > 6 && <button className="text-button" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : "See all"}</button>}
      </div>
      {error ? (
        <div className="error-notice" role="alert">
          {error}
          <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </div>
      ) : !data ? (
        <Skeletons row />
      ) : items.length ? (
        <div className="discovery-row">
          {(showAll ? items : items.slice(0, 6)).map((item) => (
            <div key={item.title.id}>
              <TitleCard {...actions} title={{ ...item.title, upcomingRelease: undefined }} releaseFocus />
              <div className="activity-date">
                <time dateTime={item.date}>
                  {mode === "new" ? "Arrived" : "Last day"} {releaseDateText(item.date)}
                </time>
                <span>
                  {services.find((s) => s.key === item.service)?.name} · {item.label}
                </span>
                <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                  Provider announcement
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="section-empty">
          {data.items.length
            ? "No matches for your current filters."
            : mode === "new"
              ? "No confirmed arrivals for your selected services in the past 7 days. Check Upcoming for what’s next."
              : "No confirmed leaving dates available for your selected services. This doesn’t mean nothing is leaving; we only show exact UK expiry dates from providers."}
        </p>
      )}
      {data && (
        <p className="fine-print">
          {mode === "new"
            ? "Selected provider announcements for the UK; subscription tiers and availability can vary."
            : "Dates can change. Check the provider before planning your watch."}
          {data.reviewedOn && ` Reviewed ${releaseDateText(data.reviewedOn)}.`}
          {data.total > data.items.length &&
            ` Showing the first ${data.items.length} of ${data.total} announcements.`}
          {data.message && ` ${data.message}`}{" "}
        </p>
      )}
    </section>
  );
}
