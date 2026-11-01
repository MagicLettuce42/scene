"use client";
import { watchlistAvailability, availabilityLabels } from "../../lib/watchlist-availability";
import ReleaseBadge from "./release-badge";
import { useEffect, useState } from "react";
import { Clapperboard, Check, Bookmark, ArrowUpRight, Heart, Eye, EyeOff, Star } from "lucide-react";
import { services, type Title, type Offer } from "../../lib/catalogue";
import { findFeedback, type Feedback, type FeedbackAction } from "../../lib/preferences";
export function Poster({ title, priority = false }: { title: Title; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [title.poster]);
  const tmdb = title.poster?.match(/^(https:\/\/image\.tmdb\.org\/t\/p\/)(?:w\d+|original)(\/[^?]+)$/);
  const srcSet = tmdb ? [185, 342, 500].map(w => `${tmdb[1]}w${w}${tmdb[2]} ${w}w`).join(", ") : undefined;
  return title.poster && !failed ? (
    <img src={title.poster} srcSet={srcSet} sizes={priority ? "128px" : "(max-width: 650px) 45vw, (max-width: 1100px) 25vw, 220px"}
      width={300} height={450} alt="" loading={priority ? "eager" : "lazy"} decoding="async"
      fetchPriority={priority ? "high" : "auto"} onError={() => setFailed(true)} />
  ) : (
    <div className="poster-fallback">
      <Clapperboard />
      <span>{title.name}</span>
      <small>Artwork coming soon</small>
    </div>
  );
}
export function ServiceMark({ serviceKey, small = false }: { serviceKey: string; small?: boolean }) {
  const s = services.find((s) => s.key === serviceKey);
  return (
    <span
      aria-hidden="true"
      className={`service-mark ${small ? "small" : ""} service-${serviceKey}`}
      style={{ color: s?.color || "#d9dadf" }}
    >
      {s?.short || "TV"}
    </span>
  );
}
export function myOffers(offers: Offer[], selected: string[], watchOption = "all") {
  return offers.filter(
    (o) =>
      selected.includes(o.key) &&
      (o.type === "sub" || o.type === "free") &&
      (watchOption === "all" || o.type === watchOption),
  );
}
export function FeedbackButtons({
  title,
  feedback,
  onFeedback,
}: {
  title: Title;
  feedback: Feedback[];
  onFeedback: (t: Title, action: FeedbackAction) => void;
}) {
  const f = findFeedback(feedback, title);
  return (
    <div className="feedback-actions" aria-label={`Your thoughts on ${title.name}`}>
      {(
        [
          { key: "watched", label: "Watched", Icon: Eye },
          { key: "liked", label: "Liked", Icon: Heart },
          { key: "hidden", label: "Not interested", Icon: EyeOff },
        ] as const
      ).map(({ key, label, Icon }) => (
        <button
          key={key}
          className={f?.[key] ? "selected" : ""}
          aria-pressed={Boolean(f?.[key])}
          aria-label={`${f?.[key] ? "Undo" : "Mark"} ${label.toLowerCase()} for ${title.name}`}
          onClick={() => onFeedback(title, key)}
        >
          <Icon size={15} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
export type CardActions = {
  search?: boolean;
  releaseFocus?: boolean;
  watchlist?: boolean;
  selected: string[];
  offer: string;
  feedback: Feedback[];
  isSaved: (t: Title) => boolean;
  onSave: (t: Title) => void;
  onOpen: (t: Title) => void;
  onFeedback: (t: Title, action: FeedbackAction) => void;
};
export function TitleCard({ title: t, ...props }: CardActions & { title: Title }) {
  const offers = myOffers(t.offers, props.selected, props.offer),
    f = findFeedback(props.feedback, t);
  return (
    <article className="title-card">
      <div className="poster-wrap">
        <button
          className="poster-open"
          onClick={() => props.onOpen(t)}
          aria-label={`View ${t.name}, ${t.year || ""}`}
        >
          <Poster title={t} />
          <span className="poster-hover">
            View details <ArrowUpRight size={18} />
          </span>
        </button>
        <button
          className={`save-button ${props.isSaved(t) ? "saved" : ""}`}
          onClick={() => props.onSave(t)}
          aria-label={`${props.isSaved(t) ? "Remove" : "Save"} ${t.name}${props.isSaved(t) ? " from" : " to"} watchlist`}
          aria-pressed={props.isSaved(t)}
        >
          <Bookmark size={18} fill={props.isSaved(t) ? "currentColor" : "none"} />
        </button>
        {f?.watched && (
          <span className="watched-badge">
            <Check size={12} /> Watched
          </span>
        )}
      </div>
      <span className="type-tag">{t.kind === "movie" ? "FILM" : "SERIES"}</span>
      <button className="title-name" onClick={() => props.onOpen(t)}>
        {t.name}
      </button>
      {!props.releaseFocus && (
        <p className="title-meta">
          {t.year || "Year unknown"}
          <span className="title-meta-extra">
            {" "}
            · {t.runtime ? `${t.runtime} min` : t.genres[0] || "TV series"}
          </span>
        </p>
      )}
      <ReleaseBadge release={t.upcomingRelease} />
      {!props.releaseFocus && t.dataSource === "tmdb" && Boolean(t.rating) && (
        <p className="card-rating">
          <Star size={12} /> {t.rating!.toFixed(1)} <span>TMDB</span>
        </p>
      )}
      <div className="title-availability">
        {props.releaseFocus ? null : props.watchlist &&
          watchlistAvailability(t, props.selected) !== "available" ? (
          <span className="unknown-availability">
            {availabilityLabels[watchlistAvailability(t, props.selected)]}
          </span>
        ) : offers.length ? (
          <>
            <ServiceMark serviceKey={offers[0].key} small />
            <span>
              {offers[0].name}
              {offers.length > 1 ? ` +${offers.length - 1}` : ""}
            </span>
          </>
        ) : (
          <span className="unknown-availability">{props.search ? "Availability not confirmed" : "Unavailable on your services"}</span>
        )}
      </div>
      <details className="card-menu">
        <summary>Your activity{f?.liked ? " · Liked" : f?.hidden ? " · Hidden" : ""}</summary>
        <FeedbackButtons title={t} feedback={props.feedback} onFeedback={props.onFeedback} />
      </details>
    </article>
  );
}
export function Skeletons({ count = 4, row = false }: { count?: number; row?: boolean }) {
  return (
    <div className={row ? "discovery-row" : "poster-grid"} role="status">
      <span className="sr-only">Loading titles…</span>
      {Array.from({ length: count }, (_, i) => (
        <div className="skeleton-card" aria-hidden="true" key={i}>
          <div />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
