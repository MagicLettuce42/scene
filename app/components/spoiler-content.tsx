"use client";
import { useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = { hidden: boolean; identity: string; label?: string; context?: string; children: ReactNode };
export default function SpoilerContent({ identity, hidden, ...props }: Props) {
  // A different item or protection setting always starts concealed again.
  return <Reveal key={`${identity}:${hidden}`} hidden={hidden} {...props} />;
}
function Reveal({ hidden, label = "plot details", context, children }: Omit<Props, "identity">) {
  const [revealed, setRevealed] = useState(false);
  if (!hidden) return <>{children}</>;
  return <span className={`spoiler-content ${revealed ? "revealed" : "concealed"}`}>
    {revealed && <span className="spoiler-text">{children}</span>}
    <button type="button" className="spoiler-reveal" aria-expanded={revealed}
      aria-label={`${revealed ? "Hide" : "Show"} ${label}${context ? `: ${context}` : ""}`}
      onClick={() => setRevealed(v => !v)}>
      {revealed ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
      {revealed ? `Hide ${label}` : `Show ${label}`}
    </button>
  </span>;
}

export function SpoilerSettings({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => void }) {
  return <label className="spoiler-setting">
    <input type="checkbox" checked={enabled} onChange={e => onChange(e.target.checked)} />
    <span><strong>Spoiler-free mode</strong><small>Hide unwatched episode titles and title synopses until you choose to reveal them. Saves to your account.</small></span>
  </label>;
}
