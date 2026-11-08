"use client";
import PersonPortrait from "./person-portrait";
import { ArrowRight, LoaderCircle } from "lucide-react";
import GameSearchCard from "./game-search-card";
import type { Game, GameCollection, GameStatus } from "../../lib/gaming";
import type { Person } from "../../lib/people";
import { filterTitles, type Title } from "../../lib/catalogue";
import { TitleCard, Skeletons, type CardActions } from "./catalogue-cards";
import ProviderSearch from "./provider-search";
export default function SearchResults({
  query,
  matchedCount, interpretation, emptyReason, suggestion, onSuggestion,
  mediaScope = "all",
  hasMore, moreBusy, moreError, onLoadMore,
  gameResults,
  gameBusy = false, gameMode = "selected", gameMessage = "", gameHasMore = false, onMoreGames, onRetryGames,
  gameCollection,
  onGameStatus,
  titles,
  people,
  peopleHasMore,
  peopleMessage,
  busy,
  checking = false,
  onPerson,
  onMorePeople,
  onServices,
  ...actions
}: CardActions & {
  query: string;
  matchedCount?:number; interpretation?:string; emptyReason?:string; suggestion?:string|null; onSuggestion?:(q:string)=>void;
  mediaScope?: "all"|"movie"|"series"|"games";
  hasMore?: boolean; moreBusy?: boolean; moreError?: string; onLoadMore?: () => void;
  gameResults?: Game[];
  gameBusy?: boolean; gameMode?: "igdb" | "selected"; gameMessage?: string; gameHasMore?: boolean;
  onMoreGames?: () => void; onRetryGames?: () => void;
  gameCollection?: GameCollection;
  onGameStatus?: (id: string, status: GameStatus | null) => void;
  titles: Title[];
  people: Person[];
  peopleHasMore: boolean;
  peopleMessage: string;
  busy: boolean;
  checking?: boolean;
  onPerson: (person: Person) => void;
  onMorePeople: () => void;
  onServices: () => void;
}) {
  const catalogueMatches = matchedCount ?? titles.length;
  const showGames = gameResults !== undefined && Boolean(onGameStatus),
    matchingGames = showGames ? gameResults || [] : [];
  if (busy && !matchingGames.length) return <Skeletons count={6} />;
  const availableTitles = busy ? [] : filterTitles(titles, { kind: "all", genre: "all", offer: actions.offer, provider: "all", mine: true, selected: actions.selected });
  const hasMatches = availableTitles.length > 0 || matchingGames.length > 0;
  return (
    <div className="unified-search-results">
      <section aria-labelledby="title-results-heading">
        {interpretation&&<p className="search-interpretation">Searching for {interpretation}</p>}
        {suggestion&&onSuggestion&&!checking&&<p className="search-correction">Did you mean <button className="text-button" onClick={()=>onSuggestion(suggestion)}>{suggestion}</button>?</p>}
        <h3 id="title-results-heading">{mediaScope==="games" ? "Games" : mediaScope==="movie" ? "Films" : mediaScope==="series" ? "TV series" : showGames ? "Films, TV series & games" : "Films & TV series"}</h3>
        <p className="fine-print">Films and TV series are limited to subscription or free listings on your selected services. Availability is checked again when you open a title.</p>
        {(checking || busy) && <p className="refresh-status" role="status"><LoaderCircle size={16} className="spin" /> Checking streaming availability… Matches appear as they are checked.</p>}
        {showGames && gameBusy && <p className="refresh-status" role="status"><LoaderCircle size={16} className="spin" /> Searching the games catalogue…</p>}
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
              {checking || gameBusy ? "Checking for matching titles…" : mediaScope==="games" ? "No matching games found. Try another game name." : catalogueMatches>0 || emptyReason==="services" ? "Matching titles have no confirmed subscription or free listing for your selected services and filters. Try adjusting the filters or services." : showGames
                  ? "No matching title found in this search. Try another spelling or a shorter title."
                  : people.length
                    ? "No matching film or series titles. Select a person below to explore their work."
                    : "No matching film or series title found in this search. Try another spelling or a shorter title."}
            </p>
            {!checking && !gameBusy && mediaScope!=="games" && (catalogueMatches>0||emptyReason==="services"||!actions.selected.length) && <button className="button secondary" onClick={onServices}>
              {actions.selected.length ? "Edit my services" : "Choose my services"}
            </button>}
          </div>
        )}
        {showGames && (
          <p className="search-game-note">
            {gameMode === "igdb" ? <>Game data by <a href="https://www.igdb.com/" target="_blank" rel="noopener noreferrer">IGDB</a>. </> : <>Games search covers Scene’s selected catalogue, not every release. </>}Game matches include all platforms and are separate from streaming services.
          </p>
        )}
        {showGames && gameMessage && <div className="game-search-message" role="status"><p className="fine-print">{gameMessage}</p>{onRetryGames && <button className="text-button" disabled={gameBusy} onClick={onRetryGames}>Retry games search</button>}</div>}
        {showGames && gameHasMore && onMoreGames && <div className="load-more"><button className="button secondary" disabled={gameBusy} onClick={onMoreGames}>{gameBusy ? "Loading more games…" : "Load more games"}</button></div>}
        {matchingGames.length > 0 && !actions.selected.length && (
          <button className="text-button" onClick={onServices}>
            Choose services to see films and TV series
          </button>
        )}
        {moreError && <p role="alert" className="error-notice">{moreError}</p>}
        {(hasMore || moreError) && onLoadMore && <div className="load-more">
          <button className="button secondary" disabled={moreBusy || checking} onClick={onLoadMore}>
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
