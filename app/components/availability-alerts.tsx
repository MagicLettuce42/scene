"use client";
import { useEffect, useState } from "react";
import { sceneFetch } from "../../lib/auth/client";
import { services, type Title } from "../../lib/catalogue";
type Alerts = {
  enabled: boolean;
  automatic: boolean;
  events: { id: string; title: Title; serviceKey: string; detectedAt: string }[];
};
export default function AvailabilityAlerts({ onOpen }: { onOpen: (title: Title) => void }) {
  const [data, setData] = useState<Alerts | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setError("");
    try {
      const r = await sceneFetch("/api/availability-alerts"),
        d = (await r.json()) as Alerts & { error?: string };
      if (!r.ok) throw Error(d.error);
      setData(d);
    } catch (e) {
      setError((e as Error).message || "Alerts could not load.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function change(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await sceneFetch("/api/availability-alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = (await r.json()) as { error?: string };
      if (!r.ok) throw Error(d.error);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="availability-alerts" className="account-security">
      <h3>Now streaming alerts</h3>
      <p>Know when a saved title becomes available on one of your selected services.</p>
      {data ? (
        <>
          <label className="check-filter">
            <input
              type="checkbox"
              checked={data.enabled}
              disabled={busy}
              onChange={(e) => change({ action: "preference", enabled: e.target.checked })}
            />
            Alert me about new availability
          </label>
          <p className="fine-print">
            The first daily check sets your starting point. Later changes appear here, with at most one alert
            per title and service every 30 days. Turn on device notifications above to receive them on this
            device, between 9am and 9pm UK time.
          </p>
          {!data.automatic && (
            <p className="error-notice">
              Daily checks are paused. Turn on automatic availability checks in Watchlist → Saved to receive
              new alerts.
            </p>
          )}
          <h4>Recent availability updates</h4>
          {data.events.length ? (
            data.events.map((e) => (
              <div className="access-row" key={e.id}>
                <div>
                  <button className="text-button" onClick={() => onOpen(e.title)}>
                    {e.title.name}
                  </button>
                  <small>
                    {services.find((s) => s.key === e.serviceKey)?.name || e.serviceKey} · Found{" "}
                    {new Date(e.detectedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </small>
                </div>
                <button
                  disabled={busy}
                  onClick={() => change({ action: "dismiss", id: e.id })}
                  aria-label={"Dismiss alert for " + e.title.name}
                >
                  Dismiss
                </button>
              </div>
            ))
          ) : (
            <p className="fine-print">
              No new availability updates in the last 30 days. Availability can change; open a title to check
              its latest viewing options.
            </p>
          )}
        </>
      ) : (
        !error && <p role="status">Loading your alerts…</p>
      )}
      {error && (
        <div className="error-notice" role="alert">
          {error}
          <button className="text-button" onClick={load}>
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
