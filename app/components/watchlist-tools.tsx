"use client";
import SelectControl from "./select-control";
import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { sceneFetch } from "../../lib/auth/client";
import { useAccount } from "./scene-access";
import { availabilityLabels, type AvailabilityFilter } from "../../lib/watchlist-availability";
import type { Title } from "../../lib/catalogue";
export default function WatchlistTools({
  titles,
  value,
  onChange,
  onRefresh,
  automatic,
  onAutomatic,
}: {
  automatic: boolean;
  onAutomatic: (enabled: boolean) => void;
  titles: Title[];
  value: AvailabilityFilter;
  onChange: (value: AvailabilityFilter) => void;
  onRefresh: (titles: Title[]) => void;
}) {
  const account = useAccount(),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  async function check() {
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setMessage("Checking your saved titles…");
    let done = 0,
      failed = 0;
    try {
      for (let i = 0; i < titles.length; i += 6) {
        const r = await sceneFetch(
          "/api/library/refresh",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: titles.slice(i, i + 6).map((t) => t.id) }),
            signal: controller.signal,
          },
          account.id,
        );
        const data = (await r.json()) as { titles: Title[]; failed: number; error?: string };
        if (!r.ok) throw Error(data.error || "The check could not finish.");
        if (controller.signal.aborted) return;
        onRefresh(data.titles);
        done += data.titles.length;
        failed += data.failed;
        setMessage(`Checked ${Math.min(i + 6, titles.length)} of ${titles.length} titles…`);
      }
      setMessage(
        `${done} titles refreshed.${failed ? ` ${failed} could not be checked. Try again later.` : ""}`,
      );
    } catch (e) {
      if (!controller.signal.aborted) setMessage((e as Error).message);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  const checks = titles.map((t) => Date.parse(t.checked || "")).filter(Number.isFinite),
    last = checks.length
      ? new Date(Math.max(...checks)).toLocaleString("en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  return (
    <div className="watchlist-tools">
      <label>
        Availability
        <SelectControl value={value} onChange={(e) => onChange(e.target.value as AvailabilityFilter)}>
          {Object.entries(availabilityLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </SelectControl>
      </label>
      <button className="button secondary" disabled={busy || !titles.length} onClick={check}>
        <RefreshCw size={16} className={busy ? "spin" : ""} />
        {busy ? "Checking…" : "Check saved titles"}
      </button>
      {busy && (
        <button
          className="text-button"
          onClick={() => {
            abort.current?.abort();
            setBusy(false);
            setMessage("Check stopped. Completed checks have been saved.");
          }}
        >
          Stop
        </button>
      )}
      <label className="automatic-watchlist">
        <input type="checkbox" checked={automatic} onChange={(e) => onAutomatic(e.target.checked)} />
        Check automatically each day
      </label>
      <p className="fine-print">
        {automatic
          ? "Checks continue while Scene is closed. Newly saved titles join the next hourly check."
          : "Automatic checks are paused for your account."}{" "}
        {last ? `Last successful title check: ${last}.` : "No availability checks yet."}
      </p>
      <p className="fine-print" role="status">
        {message ||
          "Available now uses checks from the last 24 hours. Offers can vary by season and subscription tier."}
      </p>
    </div>
  );
}
