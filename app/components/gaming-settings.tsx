"use client";
import { ArrowRight, Gamepad2 } from "lucide-react";
import { gamePlatforms, type GamePlatform } from "../../lib/gaming-state";
export type GamingSettingsProps = {
  gamingEnabled: boolean;
  gamingPlatforms: GamePlatform[];
  onGamingChange: (enabled: boolean) => void;
  onGamePlatform: (id: GamePlatform, enabled: boolean) => void;
  onOpenGaming: () => void;
};
export function PlatformChoices({
  value,
  onChange,
}: {
  value: GamePlatform[];
  onChange: (id: GamePlatform, enabled: boolean) => void;
}) {
  return (
    <fieldset className="game-platform-choices">
      <legend>My platforms</legend>
      {gamePlatforms.map((p) => (
        <label key={p.id} className={value.includes(p.id) ? "selected" : ""}>
          <input
            type="checkbox"
            checked={value.includes(p.id)}
            onChange={(e) => onChange(p.id, e.target.checked)}
          />
          {p.label}
        </label>
      ))}
    </fieldset>
  );
}
export default function GamingSettings({
  gamingEnabled,
  gamingPlatforms,
  onGamingChange,
  onGamePlatform,
  onOpenGaming,
}: GamingSettingsProps) {
  return (
    <section id="gaming-settings" className="account-security gaming-settings">
      <h3>
        <Gamepad2 size={20} /> Gaming
      </h3>
      <label className="gaming-toggle">
        <span>
          <strong>Show Gaming</strong>
          <small>Discover games and keep your own play list.</small>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={gamingEnabled}
          onChange={(e) => onGamingChange(e.target.checked)}
        />
      </label>
      <p>
        Off by default. This changes your account only. Turning it off hides Gaming and keeps your saved
        games.
      </p>
      {gamingEnabled && (
        <>
          <PlatformChoices value={gamingPlatforms} onChange={onGamePlatform} />
          <p className="fine-print">
            Choose your platforms to personalise Gaming. Leave all unticked to see every platform.
          </p>
          <button className="button secondary" onClick={onOpenGaming}>
            Open Gaming <ArrowRight size={16} />
          </button>
        </>
      )}
    </section>
  );
}
