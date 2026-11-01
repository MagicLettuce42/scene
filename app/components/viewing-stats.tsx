"use client";
import { viewingStats, type StatsInput } from "../../lib/viewing-stats";
import type { Title } from "../../lib/catalogue";
export default function ViewingStats({ onOpen, ...input }: StatsInput & { onOpen: (title: Title) => void }) {
  const stats = viewingStats(input),
    max = stats.genres[0]?.count || 1;
  return (
    <section className="viewing-stats">
      <h3>Your viewing story</h3>
      <p className="fine-print">
        Private stats from titles and episodes you’ve marked watched in Scene. They don’t include viewing
        history from your streaming accounts.
      </p>
      <dl className="stats-grid">
        <div>
          <dt>Films watched</dt>
          <dd>{stats.films}</dd>
        </div>
        <div>
          <dt>Series marked watched</dt>
          <dd>{stats.series}</dd>
        </div>
        <div>
          <dt>Episodes ticked off</dt>
          <dd>{stats.episodes}</dd>
        </div>
        <div>
          <dt>Your average rating</dt>
          <dd>{stats.averageRating ? stats.averageRating.toFixed(1) + "/5" : "—"}</dd>
          <small>{stats.ratingCount} rated titles</small>
        </div>
      </dl>
      <h3>Genres you watch</h3>
      {stats.genres.length ? (
        <div className="genre-stats">
          {stats.genres.map((g) => (
            <div key={g.name}>
              <span>{g.name}</span>
              <span>
                {g.count} {g.count === 1 ? "title" : "titles"}
              </span>
              <div aria-hidden="true" className="genre-stat-track">
                <i style={{ width: (g.count / max) * 100 + "%" }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p>Mark a film or series watched to start your stats.</p>
      )}
      <h3>Your highest ratings</h3>
      {stats.highestRated.length ? (
        <ol className="rated-stats">
          {stats.highestRated.map((r) => (
            <li key={r.title.id}>
              <button className="text-button" onClick={() => onOpen(r.title)}>
                {r.title.name}
                {r.title.year ? " (" + r.title.year + ")" : ""}
              </button>
              <strong>{r.rating}/5</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p>Open a title and give it a personal star rating to see your favourites here.</p>
      )}
      <p className="fine-print">
        Series totals use your “Watched” mark. Episode totals use your episode ticks; Scene doesn’t infer that
        a whole series is complete.
      </p>
    </section>
  );
}
