"use client";
import { useId, useMemo, useState, type CSSProperties } from "react";
import { Film, Tv, Heart, ArrowUpRight } from "lucide-react";
import { tasteProfile, type TasteBucket, type TasteRating } from "../../lib/taste-profile";
import type { Feedback } from "../../lib/preferences";
import type { Title } from "../../lib/catalogue";

const titles = (n: number) => `${n} ${n === 1 ? "title" : "titles"}`;
function Breakdown({ heading, buckets, known, total, kind }: {
  heading: string; buckets: TasteBucket[]; known: number; total: number; kind: "genre" | "year";
}) {
  const [expanded, setExpanded] = useState(false), id = useId();
  return <section className="taste-profile-card" aria-labelledby={id}>
    <h3 id={id}>{heading}</h3>
    {known ? <>
      <ol className="taste-profile-bars" id={`${id}-bars`}>
        {(expanded ? buckets : buckets.slice(0, 5)).map(b => <li key={b.label}>
          <div><span>{b.label}</span><small>{titles(b.count)}</small></div>
          <div className="taste-profile-track" aria-hidden="true"><span style={{ width: `${100 * b.count / known}%` }} /></div>
        </li>)}
      </ol>
      {buckets.length > 5 && <button className="text-button" aria-expanded={expanded} aria-controls={`${id}-bars`} onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer" : `Show all ${buckets.length} ${kind === "genre" ? "genres" : "decades"}`}</button>}
      <p className="fine-print">{kind === "genre" ? "A title can count towards more than one genre." : "Films use release year; series use their first-air year."}</p>
    </> : <p className="fine-print">No {kind === "genre" ? "genre" : "release-year"} details available for these titles yet.</p>}
    {known > 0 && known < total && <p className="fine-print">{titles(total - known)} with no {kind === "genre" ? "genre" : "year"} details left out of this chart.</p>}
  </section>;
}

export default function TasteProfile({ feedback, ratings, ready, loaded, syncStatus, onOpen }: {
  feedback: Feedback[]; ratings: TasteRating[]; ready: boolean; loaded: boolean;
  syncStatus: string; onOpen: (title: Title) => void;
}) {
  const profile = useMemo(() => tasteProfile(feedback, ratings), [feedback, ratings]);
  if (!ready || (!loaded && !profile.total && syncStatus === "connecting"))
    return <p role="status">Loading your taste profile…</p>;
  if (!loaded && !profile.total && (syncStatus === "error" || syncStatus === "offline"))
    return <p role="status">Your library isn’t available yet. Reconnect and check library sync in Account to see your taste profile.</p>;
  const filmPercent = profile.total ? Math.round(profile.films / profile.total * 100) : 0;
  return <div className="taste-profile">
    {syncStatus !== "saved" && <p className="taste-profile-sync" role="status">{syncStatus === "offline" || syncStatus === "error"
      ? "Showing the library on this device. It may differ from your account until syncing succeeds."
      : "Includes your latest changes on this device. Your library is syncing."}</p>}
    {profile.total ? <>
      <section className="taste-profile-card taste-profile-overview" aria-labelledby="taste-mix-title">
        <div className="taste-profile-donut" aria-hidden="true" style={{ "--taste-film-share": `${profile.films / profile.total * 100}%` } as CSSProperties}>
          <div><strong>{profile.total}</strong><span>{profile.total === 1 ? "title" : "titles"}</span></div>
        </div>
        <div className="taste-profile-mix">
          <p className="taste-profile-eyebrow">YOUR MIX</p>
          <h3 id="taste-mix-title">Film or series?</h3>
          <ul>
            <li><Film size={17} aria-hidden="true"/><span>Films <small>{titles(profile.films)}</small></span><strong>{filmPercent}%</strong></li>
            <li><Tv size={17} aria-hidden="true"/><span>TV series <small>{titles(profile.series)}</small></span><strong>{100 - filmPercent}%</strong></li>
          </ul>
        </div>
        <p className="taste-profile-basis">Based on {titles(profile.total)} you liked or rated 4–5 stars.</p>
        {profile.total < 5 && <p className="fine-print taste-profile-early">An early snapshot. Like or rate more titles to build a fuller picture.</p>}
      </section>
      <div className="taste-profile-breakdowns">
        <Breakdown heading="Your top genres" buckets={profile.genres} known={profile.genreTitles} total={profile.total} kind="genre" />
        <Breakdown heading="Your favourite decades" buckets={profile.decades} known={profile.yearTitles} total={profile.total} kind="year" />
      </div>
      <details className="taste-profile-details">
        <summary>Titles behind your profile ({profile.total})</summary>
        <ul>{profile.sources.map(s => <li key={s.title.id}><button onClick={() => onOpen(s.title)}>
          <span><strong>{s.title.name}</strong><small>{[s.title.kind === "movie" ? "Film" : "TV series", s.title.year, s.liked ? "Liked" : null, s.rating ? `Rated ${s.rating}/5` : null].filter(Boolean).join(" · ")}</small></span><ArrowUpRight size={17} aria-hidden="true"/>
        </button></li>)}</ul>
      </details>
    </> : <div className="taste-profile-card taste-profile-empty">
      <Heart size={28} aria-hidden="true"/><h3>Your taste starts here</h3>
      <p>Like a film or series, or give it four or five stars. Your genres, decades and film-versus-TV mix will appear here.</p>
      <p className="fine-print">You can also choose five favourites in Account → Recommendations.</p>
    </div>}
    <details className="taste-profile-details taste-profile-method">
      <summary>How your profile works</summary>
      <p>Each liked or four- or five-star title counts once, even if you both liked and rated it. Hidden titles and titles you rated below four stars are left out. Saved or watched titles alone don’t count.</p>
      <p>This covers your whole positive library, regardless of your service or browse filters. It describes your taste; For you may use a smaller selection to find recommendations.</p>
      <p>It updates as your likes and ratings change. Other Scene members can’t see your profile.</p>
    </details>
  </div>;
}
