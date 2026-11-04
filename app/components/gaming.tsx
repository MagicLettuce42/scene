"use client";
import SelectControl from "./select-control";
import { useRef, useState } from "react";
import GameArtwork from "./game-artwork";
import ReleaseCalendar from "./release-calendar";
import { ArrowUpRight, Gamepad2, Plus, SlidersHorizontal } from "lucide-react";
import {
  games,
  gamePlatforms,
  gameStatuses,
  filterGames,
  gameReleaseLabel,
  type Game,
  type GameCollection,
  type GameFilters,
  type GamePlatform,
  type GameStatus,
} from "../../lib/gaming";
import { londonDate } from "../../lib/episode-calendar";
import { PlatformChoices } from "./gaming-settings";

export type GameActions = {
  collection: GameCollection;
  onStatus: (id: string, status: GameStatus | null) => void;
};
function GameCard({ game, collection, onStatus }: GameActions & { game: Game }) {
  const status = collection[game.id];
  return (
    <article className="title-card game-card">
      <div className="poster-wrap">
        <a
          className="poster-open game-poster-open"
          href={game.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Official page for ${game.name}`}
        >
          <GameArtwork game={game} decorative />
          <span className="poster-hover">
            Official page <ArrowUpRight size={18} />
          </span>
        </a>
      </div>
      <div className="game-card-body">
        <p className="game-genre">{game.genre}</p>
        <h3>{game.name}</h3>
        {game.edition && <p className="game-edition">{game.edition}</p>}
        <div className="game-platforms" aria-label="Platforms">
          {game.platforms.map((id) => (
            <span key={id}>{gamePlatforms.find((p) => p.id === id)?.short}</span>
          ))}
        </div>
        <p className={`game-release ${game.released ? "" : "announced"}`}>
          {gameReleaseLabel(game, londonDate())}
        </p>
        <p className="game-description">{game.summary}</p>
        <div className="game-card-actions">
          {status ? (
            <label>
              <span className="sr-only">Status for {game.name}</span>
              <SelectControl
                value={status}
                onChange={(e) => onStatus(game.id, e.target.value ? (e.target.value as GameStatus) : null)}
              >
                {gameStatuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
                <option value="">Remove from My games</option>
              </SelectControl>
            </label>
          ) : (
            <button
              className="button secondary"
              onClick={() => onStatus(game.id, "later")}
              aria-label={`Add ${game.name} to Play later`}
            >
              <Plus size={16} /> Play later
            </button>
          )}
          <a
            href={game.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Official page for ${game.name}`}
          >
            Official page <ArrowUpRight size={15} />
          </a>
        </div>
      </div>
    </article>
  );
}
export function GameGrid({ items, ...actions }: GameActions & { items: Game[] }) {
  return (
    <div className="poster-grid game-grid">
      {items.map((game) => (
        <GameCard key={game.id} game={game} {...actions} />
      ))}
    </div>
  );
}
export function ActiveGamePlatforms({
  mode,
  platforms,
  onPlatform,
  onUseMine,
}: {
  mode: GameFilters["platform"];
  platforms: GamePlatform[];
  onPlatform: (id: GamePlatform, enabled: boolean) => void;
  onUseMine: () => void;
}) {
  if (mode === "mine")
    return (
      <>
        <PlatformChoices value={platforms} onChange={onPlatform} />
        <p className="fine-print">
          Tick a platform to filter the games below. Your choices also save to your account. With none ticked,
          all platforms are shown.
        </p>
      </>
    );
  return (
    <div className="game-platform-scope">
      <p className="fine-print">
        {mode === "all"
          ? "Showing games from every platform."
          : `Showing games for ${gamePlatforms.find((p) => p.id === mode)?.label}.`}{" "}
        Your saved platform choices are kept for My platforms.
      </p>
      <button className="text-button" onClick={onUseMine}>
        {platforms.length ? "Use my platforms" : "Choose my platforms"}
      </button>
    </div>
  );
}
export type GamingProps = GameActions & {
  platforms: GamePlatform[];
  onPlatform: (id: GamePlatform, enabled: boolean) => void;
};
export function UpcomingGames(props: GamingProps & { calendar?: boolean }) {
  return <Gaming {...props} upcoming />;
}
export default function Gaming({
  platforms,
  onPlatform,
  upcoming = false,
  calendar = false,
  ...actions
}: GamingProps & { upcoming?: boolean; calendar?: boolean }) {
  const [browseTab, setTab] = useState<"explore" | "collection">("explore"),
    [platform, setPlatform] = useState<GameFilters["platform"]>("mine"),
    [genre, setGenre] = useState("all"),
    [status, setStatus] = useState<GameFilters["status"]>("all");
  const options = useRef<HTMLDetailsElement>(null);
  const tab = upcoming ? "upcoming" : browseTab;
  const [page, setPage] = useState({ key: "", count: 12 });
  const items = filterGames(
      { tab, platform, genre, status: tab === "collection" ? status : "all" },
      platforms,
      actions.collection,
    ),
    count = Object.keys(actions.collection).length;
  const pageKey = JSON.stringify([tab, platform, genre, platforms]),
    visibleCount = page.key === pageKey ? page.count : 12;
  const visibleItems = tab === "explore" ? items.slice(0, visibleCount) : items,
    remaining = items.length - visibleItems.length;
  const today = londonDate(),
    latestDate = items.reduce(
      (latest, game) => (game.date && game.date > latest ? game.date : latest),
      today,
    );
  const unplaced = items.filter((game) => !game.date || game.date < today);
  const myPlatformLabel =
    platforms.length === 1
      ? `My platforms · ${gamePlatforms.find((p) => p.id === platforms[0])?.short}`
      : platforms.length
        ? `My platforms (${platforms.length})`
        : "My platforms · choose below";
  const platformSummary =
    platform === "all"
      ? "All platforms"
      : platform === "mine"
        ? platforms.length
          ? platforms.map((p) => gamePlatforms.find((x) => x.id === p)?.short).join(", ")
          : "All platforms"
        : gamePlatforms.find((p) => p.id === platform)?.short;
  const constraints = [
    platformSummary !== "All platforms" ? platformSummary : null,
    genre !== "all" ? genre : null,
    tab === "collection" && status !== "all" ? gameStatuses.find(s => s.id === status)?.label : null,
  ].filter(Boolean).join(" · ");
  function changeFilters() {
    if (!options.current) return;
    options.current.open = true;
    options.current.querySelector("select")?.focus();
  }
  function reset() {
    setPlatform("all");
    setGenre("all");
    setStatus("all");
  }
  function choosePlatform(id: GamePlatform, enabled: boolean) {
    setPlatform("mine");
    onPlatform(id, enabled);
  }
  return (
    <div className="gaming">
      {!upcoming && (
        <div className="game-tabs" aria-label="Gaming views">
          {[
            ["explore", "Explore"],
            ["collection", `My games${count ? ` (${count})` : ""}`],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              aria-pressed={tab === key}
              onClick={() => setTab(key as "explore" | "collection")}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <details ref={options} className="game-options">
        <summary>
          <SlidersHorizontal size={18} aria-hidden="true" />
          <span>
            <strong>Filters & platforms</strong>
            <small>
              {platformSummary} · {genre === "all" ? "All genres" : genre}
              {tab === "collection" && status !== "all"
                ? ` · ${gameStatuses.find((s) => s.id === status)?.label}`
                : ""}
            </small>
          </span>

        </summary>
        <div className="game-options-body">
          <p className="fine-print">{games.length} selected games. This catalogue does not cover every release.</p>
          <div className="game-filter-fields">
            <label>
              Show games for
              <SelectControl
                value={platform}
                onChange={(e) => setPlatform(e.target.value as GameFilters["platform"])}
              >
                <option value="mine">{myPlatformLabel}</option>
                <option value="all">All platforms</option>
                {gamePlatforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </SelectControl>
            </label>
            <label>
              Genre
              <SelectControl value={genre} onChange={(e) => setGenre(e.target.value)}>
                <option value="all">All genres</option>
                {[...new Set(games.map((g) => g.genre))].sort().map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </SelectControl>
            </label>
            {tab === "collection" && (
              <label>
                My progress
                <SelectControl value={status} onChange={(e) => setStatus(e.target.value as GameFilters["status"])}>
                  <option value="all">All progress</option>
                  {gameStatuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </SelectControl>
              </label>
            )}
          </div>
          <ActiveGamePlatforms
            mode={platform}
            platforms={platforms}
            onPlatform={choosePlatform}
            onUseMine={() => setPlatform("mine")}
          />
          <button className="text-button" onClick={reset}>
            Clear filters
          </button>
        </div>
      </details>
      <div className="gaming-result-summary">
        <p role="status" aria-live="polite">
          {tab === "collection"
            ? `Showing ${items.length} of ${count} saved ${count === 1 ? "game" : "games"}`
            : `Showing ${visibleItems.length} of ${items.length} matching ${items.length === 1 ? "game" : "games"}`}
          {tab === "upcoming" ? " · Soonest first" : ""}
        </p>

      </div>
      {upcoming && calendar && items.length > 0 ? (
        <>
          <ReleaseCalendar
            items={items}
            dateOf={(game) => game.date}
            from={today}
            to={latestDate}
            renderItems={(games) => <GameGrid items={games} {...actions} />}
            coverageNote="Announced game dates for your selected platforms. Dates can change; this is a selected catalogue."
          />
          {unplaced.length > 0 && (
            <div className="release-calendar-agenda">
              <h3>Date needs checking</h3>
              <p>These games have no future date confirmed in this selection.</p>
              <GameGrid items={unplaced} {...actions} />
            </div>
          )}
        </>
      ) : items.length ? (
        <div id="gaming-results">
          <GameGrid items={visibleItems} {...actions} />
        </div>
      ) : (
        <div className="empty-state">
          <Gamepad2 size={36} />
          <h3>
            {tab === "collection" && !count ? "Your next game starts here" : "No games match this view"}
          </h3>
          <p>
            {tab === "collection" && !count
              ? "Choose Play later on a game to start your list."
              : constraints
                ? `No games match: ${constraints}. Your saved games and platform preferences are kept.`
                : "This selected catalogue has no games in this view yet."}
          </p>
          <button
            className="button primary"
            onClick={() => {
              if (tab === "collection" && !count) setTab("explore");
              else reset();
            }}
          >
            {tab === "collection" && !count ? "Explore games" : "Clear filters"}
          </button>
          {constraints && <>
            <button className="button secondary" onClick={changeFilters}>Change filters</button>
            <p className="fine-print">Clear filters shows all platforms in this view without changing My platforms.</p>
          </>}
        </div>
      )}
      {tab === "explore" && items.length > 12 && (
        <div className="browse-pagination game-pagination">
          {remaining > 0 ? (
            <>
              <button
                className="button secondary"
                aria-controls="gaming-results"
                onClick={() => setPage({ key: pageKey, count: visibleCount + 12 })}
              >
                <Plus size={17} /> Load more games
              </button>
              <p>
                {remaining} more {remaining === 1 ? "game" : "games"} match your filters.
              </p>
            </>
          ) : (
            <p>You’ve reached the end of this selection.</p>
          )}
        </div>
      )}
      <p className="gaming-source-note">
        A selected catalogue, with official links for game details, age ratings and purchase options. A missing result does not mean a game does not exist. Dates
        may change; an announced date does not confirm a release. Platform listings cover the editions shown.
        Subscription inclusion is not tracked. Your game progress is saved manually and is private to your
        Scene account.
      </p>
    </div>
  );
}
