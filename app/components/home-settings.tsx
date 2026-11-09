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
    const moving=sections[index];if(moving==="tonight"||moving==="watchlist")return;
    const movable=sections.filter(id=>id!=="tonight"&&id!=="watchlist"), position=movable.indexOf(moving);
    const other=sections.indexOf(movable[position+delta]);
    if(position<0||other<0)return;
    [sections[index], sections[other]] = [sections[other], sections[index]];
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
            <option value="manga">Manga</option>
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
      <h3>Your Discover mix</h3>
      <div className="inline-actions">
        <button className="button secondary" onClick={()=>{const d=defaultHome();onChange({sections:d.sections,hidden:d.hidden});}}>Films & TV</button>
        <button className="button secondary" onClick={()=>onChange({sections:["manga","reading",...value.sections.filter(id=>id!=="manga"&&id!=="reading")],hidden:value.sections.filter(id=>id!=="manga"&&id!=="reading")})}>Manga focus</button>
        <button className="button secondary" onClick={()=>onChange({hidden:gamingEnabled?[]:["games"]})}>Everything</button>
      </div>
      <h3>Discover sections</h3>
      <p className="fine-print">Choose what appears and move shelves into your preferred order. Discover starts with your first two enabled shelves; the rest appear under More to explore. Watch tonight stays at the top and your watchlist follows the first shelf when enabled. Episode tracking is in Watchlist → Watching. Enable Gaming in your account to add games.</p>
      <ol className="home-section-order">
        {value.sections.map((id, i) => {
          const label = homeSections.find((s) => s.id === id)!.label;
          return (
            <li key={id}>
              <label>
                <input
                  type="checkbox"
                  disabled={id==="games"&&!gamingEnabled}
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
                  disabled={id==="tonight"||id==="watchlist"||value.sections.filter(k=>k!=="tonight"&&k!=="watchlist")[0]===id}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Move ${label} down`}
                  disabled={id==="tonight"||id==="watchlist"||value.sections.filter(k=>k!=="tonight"&&k!=="watchlist").at(-1)===id}
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
