"use client";
import { useId } from "react";
import { Check } from "lucide-react";
import { themes, type ThemeId } from "../../lib/themes";
export default function ThemePicker({
  value,
  onChange,
  description,
}: {
  value: ThemeId;
  onChange: (theme: ThemeId) => void;
  description?: string;
}) {
  const id = useId();
  return (
    <fieldset className="theme-picker">
      <legend>Your theme</legend>
      <p className="fine-print" id={`${id}-help`}>
        {description ||
          "Make Scene feel like you. Your choice saves to your account and follows you across devices."}
      </p>
      <div className="theme-options" aria-describedby={`${id}-help`}>
        {themes.map((theme) => (
          <label key={theme.id} className={`theme-option ${value === theme.id ? "selected" : ""}`}>
            <input
              type="radio"
              name={`${id}-theme`}
              value={theme.id}
              checked={value === theme.id}
              onChange={() => onChange(theme.id)}
            />
            <span
              className="theme-palette"
              aria-hidden="true"
              style={{ background: theme.accent, borderColor: theme.accent, color: theme.background }}
            >
              <Check size={20} style={{ visibility: value === theme.id ? "visible" : "hidden" }} />
            </span>
            <span className="theme-label">
              <strong>{theme.name}</strong>
              <small>{theme.description}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
