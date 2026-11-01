"use client";
import GameArtwork from "./game-artwork";
import { ArrowUpRight, Bookmark } from "lucide-react";
import { gamePlatforms, gameReleaseLabel, gameStatuses, type Game } from "../../lib/gaming-state";
import { londonDate } from "../../lib/episode-calendar";
import type { GameActions } from "./gaming";

export default function GameSearchCard({ game, collection, onStatus }: GameActions & { game: Game }) {
  const status = collection[game.id];
  return (
    <article className="title-card game-search-card">
      <div className="poster-wrap">
        <a
          className="poster-open game-poster-open"
          href={game.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Official page for ${game.name}`}
        >
          <GameArtwork game={game} />
          <span className="poster-hover">
            Official page <ArrowUpRight size={18} />
          </span>
        </a>
        <button
          className={`save-button ${status ? "saved" : ""}`}
          onClick={() => onStatus(game.id, status ? null : "later")}
          aria-label={status ? `Remove ${game.name} from My games` : `Add ${game.name} to Play later`}
          aria-pressed={Boolean(status)}
        >
          <Bookmark size={18} fill={status ? "currentColor" : "none"} />
        </button>
      </div>
      <span className="type-tag">GAME</span>
      <a className="title-name" href={game.sourceUrl} target="_blank" rel="noopener noreferrer">
        {game.name}
      </a>
      <p className="title-meta game-search-platforms">
        {game.platforms.map((id) => gamePlatforms.find((p) => p.id === id)?.short).join(" · ")}
      </p>
      <p className="game-release">
        {gameReleaseLabel(game, londonDate())}
        {status ? ` · ${gameStatuses.find((s) => s.id === status)?.label}` : ""}
      </p>
    </article>
  );
}
