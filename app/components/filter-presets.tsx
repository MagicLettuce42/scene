"use client";
import SelectControl from "./select-control";
import { useState } from "react";
import type { FilterPreset } from "../../lib/filter-presets";
import { newId } from "../../lib/shared-lists";
export default function FilterPresets({ presets, current, onSave, onApply, onRemove }: {
  presets: FilterPreset[]; current: Omit<FilterPreset, "id" | "name">;
  onSave: (preset: FilterPreset) => void; onApply: (preset: FilterPreset) => void; onRemove: (id: string) => void;
}) {
  const [name, setName] = useState(""), [message, setMessage] = useState("");
  return <div className="saved-filter-presets">
    <label>Saved filters
      <SelectControl value="" onChange={e => { const item = presets.find(p => p.id === e.target.value); if (item) { onApply(item); setMessage(`Applied ${item.name}`); } }}>
        <option value="">Choose a saved filter…</option>
        {presets.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}
      </SelectControl>
    </label>
    <details><summary>Save or manage filters</summary>
      <form className="inline-actions" onSubmit={e => { e.preventDefault(); if (!name.trim() || presets.length >= 12) return;
        onSave({ ...current, id: newId(), name: name.trim() }); setMessage(`Saved ${name.trim()}`); setName(""); }}>
        <label>Filter name<input value={name} maxLength={40} placeholder="Friday night" onChange={e => setName(e.target.value)} required /></label>
        <button className="button secondary" disabled={!name.trim() || presets.length >= 12}>Save current filters</button>
      </form>
      <p className="fine-print">Saved to your account across devices. Up to 12 presets. Your saved services stay unchanged.</p>
      {presets.map(p => <div className="inline-actions" key={p.id}><span>{p.name}</span>
        <button type="button" className="text-button" onClick={() => { onRemove(p.id); setMessage(`Removed ${p.name}`); }} aria-label={`Remove saved filter ${p.name}`}>Remove</button></div>)}
    </details>
    <p className="fine-print" role="status">{message}</p>
  </div>;
}
