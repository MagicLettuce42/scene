"use client";
import SelectControl from "./select-control";
import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import {
  parseExtraFilters,
  catalogueYearGroups,
  extraParams,
  originalLanguages,
  type ExtraFilters,
} from "../../lib/catalogue-filters";
export default function ExtraFilterFields({
  value,
  onChange,
  onReset,
  series = false,
}: {
  value: ExtraFilters;
  onChange: (filters: ExtraFilters) => void;
  onReset?: () => void;
  series?: boolean;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  useEffect(() => {
    setDraft(extraParams(value));
    setError("");
  }, [value]);
  function field(key: string, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    setError("");
  }
  function apply() {
    const next = parseExtraFilters(new URLSearchParams(draft));
    if (!next) {
      setError("Use years from 1870 to 2100, with the From year no later than To year.");
      return;
    }
    onChange(next);
  }
  return (
    <div className="extra-filters">
      <div className="settings-fields">
        {!series && (
          <label className="filter-wide">
            Film length
            <SelectControl value={draft.runtimeMax || ""} onChange={(e) => field("runtimeMax", e.target.value)}>
              <option value="">Any length</option>
              <option value="90">90 minutes or less</option>
              <option value="100">100 minutes or less</option>
              <option value="120">2 hours or less</option>
              <option value="150">2½ hours or less</option>
            </SelectControl>
          </label>
        )}
        {(["yearFrom", "yearTo"] as const).map((key) => (
          <label key={key}>
            {key === "yearFrom" ? "From year" : "To year"}
            <SelectControl value={draft[key] || ""} onChange={(e) => field(key, e.target.value)}>
              <option value="">Any year</option>
              {catalogueYearGroups().map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.years.map((year) => (
                    <option key={year} value={year} disabled={key === "yearFrom"
                      ? !!draft.yearTo && year > Number(draft.yearTo)
                      : !!draft.yearFrom && year < Number(draft.yearFrom)}>{year}</option>
                  ))}
                </optgroup>
              ))}
            </SelectControl>
          </label>
        ))}
        <label className="filter-wide">
          Minimum TMDB score
          <SelectControl value={draft.minRating || ""} onChange={(e) => field("minRating", e.target.value)}>
            <option value="">Any score</option>
            {[5, 6, 7, 8, 9].map((n) => (
              <option key={n} value={n}>
                {n}+ / 10 · 50+ votes
              </option>
            ))}
          </SelectControl>
        </label>
        <label className="filter-wide">
          Original language
          <SelectControl value={draft.language || ""} onChange={(e) => field("language", e.target.value)}>
            <option value="">Any language</option>
            {originalLanguages.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </SelectControl>
        </label>
      </div>
      <p className="fine-print">
        {series
          ? "Years refer to a series’ first release."
          : "Film length applies to films; series are kept in mixed results."}{" "}
        Original language does not indicate available dubbing or subtitles.
      </p>
      {error && (
        <p className="error-notice" role="alert">
          {error}
        </p>
      )}
      <div className="filter-actions">
        <button className="button primary" onClick={apply} type="button">
          Apply extra filters
        </button>
        {onReset && (
          <button className="text-button" onClick={onReset} type="button">
            <RotateCcw size={16} /> Reset filters
          </button>
        )}
      </div>
    </div>
  );
}
