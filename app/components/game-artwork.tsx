"use client";
import { useEffect, useState } from "react";
import { Gamepad2 } from "lucide-react";
import type { Game } from "../../lib/gaming";

export default function GameArtwork({ game }: { game: Game }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [game.image]);
  return game.image && !failed ? (
    <img src={game.image} alt="" loading="lazy" onError={() => setFailed(true)} />
  ) : (
    <div className="poster-fallback">
      <Gamepad2 />
      <span>{game.name}</span>
      <small>Artwork coming soon</small>
    </div>
  );
}
