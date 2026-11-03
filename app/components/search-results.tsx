"use client";
import PersonPortrait from "./person-portrait";
import { ArrowRight } from "lucide-react";
import GameSearchCard from "./game-search-card";
import type { Game, GameCollection, GameStatus } from "../../lib/gaming";
import type { Person } from "../../lib/people";
import { filterTitles, type Title } from "../../lib/catalogue";
import { TitleCard, Skeletons, type CardActions } from "./catalogue-cards";
import ProviderSearch from "./provider-search";
export default function SearchResults({
  query,
  hasMore, moreBusy, moreError, onLoadMore,
  gameResults,
  gameCollection,
  onGameStatus,
  titles,
  people,
  peopleHasMore,
  peopleMessage,
  busy,
  onPerson,
  onMorePeople,
  onServices,
  ...actions
}: CardActions & {
  query: string;
  hasMore?: boolean; moreBusy?: boolean; moreError?: string; onLoadMore?: () => void;
  gameResults?: Game[];
  gameCollection?: GameCollection;
  onGameStatus?: (id: string, status: GameStatus | null) => void;
  titles: Title[];
  people: Person[];
  peopleHasMore: boolean;
  peopleMessage: string;
  busy: boolean;
  onPerson: (person: Person) => void;
  onMorePeople: () => void;
  onServices: () => void;
}) {
  if (busy) return <Skeletons count={6} />;
  const showGames = gameResults !== undefined && Boolean(onGameStatus),
    matchingGames = showGames ? gameResults || [] : [];
  const availableTitles = filterTitles(titles, { kind: "all", genre: "all", offer: actions.offer, provider: "all", mine: true, selected: actions.selected });
  const hasMatches = availableTitles.length > 0 || matchingGames.length > 0;
  return (
    <div className="unified-search-results">
      <section aria-labelledby="title-results-heading">
        <h3 id="title-results-heading">{showGames ? "Films, TV series & games" : "Films & TV series"}</h3>
        <p className="fine-print">Films and TV series are limited to subscription or free listings on your selected services. Availability is checked again when you open a title.</p>
        {hasMatches ? (
          <div className="poster-grid">
            {availableTitles.map((t) => (
              <TitleCard key={`title-${t.kind}-${t.id}`} title={t} {...actions} search />
            ))}
            {matchingGames.map((game) => (
              <GameSearchCard
                key={`game-${game.id}`}
                game={game}
                collection={gameCollection || {}}
                onStatus={onGameStatus!}
              />
            ))}
          </div>
        ) : (
          <div className="quiet-empty">
            <p>
              {showGames
                  ? "No matching films or series on your selected services, or games in Scene’s catalogue. Try another name or adjust your filters."
                  : people.length
                    ? "No matching film or series titles. Select a person below to explore their work."
                    : "No films or series are listed on your selected services for this search and filters. Try another name or edit your services."}
            </p>
            <button className="button secondary" onClick={onServices}>
              {actions.selected.length ? "Edit my services" : "Choose my services"}
            </button>
          </div>
        )}
        {matchingGames.length > 0 && (
          <p className="search-game-note">
            Game matches are from Scene’s selected catalogue · all platforms.
          </p>
        )}
        {matchingGames.length > 0 && !actions.selected.length && (
          <button className="text-button" onClick={onServices}>
            Choose services to see films and TV series
          </button>
        )}
        {moreError && <p role="alert" className="error-notice">{moreError}</p>}
        {(hasMore || moreError) && onLoadMore && <div className="load-more">
          <button className="button secondary" disabled={moreBusy} onClick={onLoadMore}>
            {moreBusy ? "Loading more titles…" : moreError ? "Retry loading more titles" : "Load more films & TV series"}
          </button><p className="fine-print">Your services and title filters apply to every page. Other services and unconfirmed listings are hidden.</p>
        </div>}
        {actions.selected.includes("bbc") && <ProviderSearch query={query} />}
      </section>
      {people.length > 0 && (
        <section aria-labelledby="people-results-heading">
          <div className="search-section-heading">
            <h3 id="people-results-heading">Actors & directors</h3>
            {(peopleHasMore || people.length > 6) && (
              <button className="text-button" onClick={onMorePeople}>
                More people <ArrowRight size={14} />
              </button>
            )}
          </div>
          <div className="search-people-grid">
            {people.slice(0, 6).map((p) => (
              <button className="person-result" key={p.id} onClick={() => onPerson(p)}>
                <PersonPortrait name={p.name} photo={p.photo} decorative />
                <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.department === "Acting"
                      ? "Actor"
                      : p.department === "Directing"
                        ? "Director"
                        : p.department || "View credits"}
                  </small>
                </span>
                <ArrowRight size={16} />
              </button>
            ))}
          </div>
        </section>
      )}
      {peopleMessage && (
        <p className="fine-print" role="status">
          {peopleMessage}{" "}
          <button className="text-button" onClick={onMorePeople}>
            Search people again
          </button>
        </p>
      )}
    </div>
  );
}
