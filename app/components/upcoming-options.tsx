import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
export default function UpcomingOptions({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="upcoming-options">
      <summary>
        <SlidersHorizontal size={18} aria-hidden="true" />
        <span>
          <strong>Filters & info</strong>
          <small>{summary}</small>
        </span>

      </summary>
      <div className="upcoming-options-body">{children}</div>
    </details>
  );
}
