"use client";
import SelectControl from "./select-control";
import { ArrowUp, ArrowDown, RotateCcw } from "lucide-react";
import { homeSections, defaultHome, type HomePreferences } from "../../lib/home-preferences";
export default function HomeSettings({
  value,
  onChange,
  gamingEnabled = false,
  embedded = false,
}: {
  embedded?: boolean;
  gamingEnabled?: boolean;
  value: HomePreferences;
  onChange: (fields: Partial<HomePreferences>) => void;
}) {
  function move(index: number, delta: number) {
    const sections = [...value.sections];
    [sections[index], sections[index + delta]] = [sections[index + delta], sections[index]];
    onChange({ sections });
  }
  const content = (
    <>
      <p className="fine-print">
        Saved to your account. Your starting tab applies on a new visit; an open tab keeps its place.
      </p>
      <div className="settings-fields">
        <label>
          Starting tab
          <SelectControl
            value={value.startView === "gaming" && !gamingEnabled ? "discover" : value.startView}
            onChange={(e) => onChange({ startView: e.target.value as HomePreferences["startView"] })}
          >
            <option value="discover">Discover</option>
            <option value="films">Films</option>
            <option value="series">TV series</option>
            <option value="upcoming">Upcoming</option>
            <option value="watchlist">Watchlist</option>
            {gamingEnabled && <option value="gaming">Gaming</option>}
          </SelectControl>
        </label>
        <label>
          Poster size
          <SelectControl
            value={value.density}
            onChange={(e) => onChange({ density: e.target.value as HomePreferences["density"] })}
          >
            <option value="compact">Compact · more titles</option>
            <option value="comfortable">Larger · more detail</option>
          </SelectControl>
        </label>
      </div>
      <h3>Discover sections</h3>
      <p className="fine-print">Choose what appears and move sections into your preferred order. Discover starts with your first four enabled sections; the rest appear under More to explore. Seasonal sections appear when available.</p>
      <ol className="home-section-order">
        {value.sections.map((id, i) => {
          const label = homeSections.find((s) => s.id === id)!.label;
          return (
            <li key={id}>
              <label>
                <input
                  type="checkbox"
                  checked={!value.hidden.includes(id)}
                  onChange={(e) =>
                    onChange({
                      hidden: e.target.checked ? value.hidden.filter((s) => s !== id) : [...value.hidden, id],
                    })
                  }
                />
                {label}
              </label>
              <div>
                <button
                  className="icon-button"
                  aria-label={`Move ${label} up`}
                  disabled={!i}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move ${label} down`}
                  disabled={i === value.sections.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={17} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {value.hidden.length === value.sections.length && (
        <p className="fine-print">
          All Discover sections are hidden. Films, TV series and your watchlist remain available.
        </p>
      )}
      <button className="text-button" onClick={() => onChange(defaultHome())}>
        <RotateCcw size={15} /> Reset home screen
      </button>
    </>
  );
  return embedded ? (
    <section className="home-settings home-settings-embedded">
      <h3>Home screen & poster size</h3>
      {content}
    </section>
  ) : (
    <details className="home-settings">
      <summary>Home screen & poster size</summary>
      {content}
    </details>
  );
}
