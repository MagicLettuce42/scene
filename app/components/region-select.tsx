"use client";
import { regions, type Region } from "../../lib/region";
export default function RegionSelect({ value, onChange }: { value: Region; onChange: (value: Region) => void }) {
  return <label className="region-setting"><span>Country / region</span><select value={value} onChange={e => onChange(e.target.value as Region)}>{regions.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}</select><small>Service options and film &amp; TV availability follow this country. You can change it anytime.</small></label>;
}
