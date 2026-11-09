"use client";
import { useEffect, useState } from "react";
import { Gamepad2 } from "lucide-react";
import type { Game } from "../../lib/gaming";

export default function GameArtwork({ game, decorative = false }: { game: Game; decorative?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [game.image]);
  const retina = /^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_cover_big\/[a-zA-Z0-9_]+\.jpg$/.test(game.image) ? game.image.replace("/t_cover_big/", "/t_cover_big_2x/") : "";
  return game.image && !failed ? (
    <img src={game.image} srcSet={retina ? `${game.image} 1x, ${retina} 2x` : undefined} alt={decorative ? "" : `Artwork for ${game.name}`} style={game.imageFit ? { objectFit: game.imageFit } : undefined} referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} />
  ) : (
    <div className="poster-fallback">
      <Gamepad2 />
      <span>{game.name}</span>
      <small>Artwork coming soon</small>
    </div>
  );
}
