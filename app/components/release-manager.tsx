"use client";
import SelectControl from "./select-control";
import { useEffect, useState } from "react";
import { sceneFetch } from "../../lib/auth/client";
import { services } from "../../lib/catalogue";
import { useAccount } from "./scene-access";
import { VerifyTwoFactor } from "./two-factor";
type RecordKind = "release" | "departure";
type ReleaseRecord = {
  id: string;
  title: string;
  kind: "movie" | "series";
  original_year: number | null;
  release_date?: string;
  last_available_date?: string;
  service_key: string;
  label?: string;
  source_url: string;
  verified_on: string;
  active: boolean;
  tmdb_id: number | null;
  poster_url: string | null;
  event_type?: string | null;
  updated_at?: string;
};
type Dashboard = {
  releases: ReleaseRecord[];
  departures: ReleaseRecord[];
  status: {
    reviewed_at: string;
    departure_reviewed_at: string | null;
    coverage_note: string;
    departure_coverage_note: string | null;
  };
  watchlist: { last_run_at: string | null; checked: number; failed: number };
  notifications: { last_run_at: string | null; sent: number; failed: number };
  edits: { record_kind: string; record_id: string; changed_at: string; title: string }[];
};
const dateTime = (date: string | null | undefined) =>
  date
    ? new Date(date).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : "No check recorded";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export default function ReleaseManager() {
  const account = useAccount(),
    [data, setData] = useState<Dashboard | null>(null),
    [type, setType] = useState<RecordKind>("release"),
    [query, setQuery] = useState(""),
    [record, setRecord] = useState<ReleaseRecord | null>(null),
    [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    setError("");
    try {
      const r = await sceneFetch("/api/admin/releases"),
        d = (await r.json()) as Dashboard & { error?: string };
      if (!r.ok) throw Error(d.error);
      setData(d);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (account.security.adminReady) void load();
    else setData(null);
  }, [account.security.adminReady]);
  function edit(value: ReleaseRecord) {
    setRecord({ ...value });
    setReviewed(false);
    setError("");
    setMessage("");
  }
  function add() {
    edit({
      id: "release-" + crypto.randomUUID(),
      title: "",
      kind: "movie",
      original_year: null,
      release_date: "",
      last_available_date: "",
      service_key: services[0].key,
      label: "New film",
      source_url: "",
      verified_on: today(),
      active: true,
      tmdb_id: null,
      poster_url: null,
    });
  }
  function update(fields: Partial<ReleaseRecord>) {
    setRecord((r) =>
      r
        ? {
            ...r,
            ...fields,
            ...("title" in fields || "kind" in fields || "original_year" in fields
              ? { tmdb_id: null, poster_url: null }
              : {}),
          }
        : r,
    );
    setReviewed(false);
  }
  async function post(body: unknown) {
    const r = await sceneFetch("/api/admin/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      d = (await r.json()) as Partial<ReleaseRecord> & { error?: string };
    if (!r.ok) throw Error(d.error);
    return d;
  }
  async function artwork() {
    if (!record) return;
    setBusy(true);
    setError("");
    try {
      const d = await post({
        action: "artwork",
        title: record.title,
        kind: record.kind,
        year: record.original_year,
      });
      setRecord((r) => (r ? { ...r, ...d } : r));
      setMessage(
        d.poster_url
          ? "Matching artwork found. Save the record to apply it."
          : "Title matched, but no poster is available.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!record || !reviewed) return;
    setBusy(true);
    setError("");
    try {
      await post({
        action: "save",
        kind: type,
        record: { ...record, verified_on: today() },
        expected: record.updated_at || null,
      });
      setRecord(null);
      setMessage("Release saved. The feed will reflect this change on its next refresh.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (account.role !== "owner")
    return (
      <>
        <h2 id="dialog-title">Release management</h2>
        <p>This screen is for the Scene owner.</p>
      </>
    );
  return (
    <>
      <p className="eyebrow">SCENE OWNER</p>
      <h2 id="dialog-title">Release management</h2>
      {!account.security.adminReady ? (
        <VerifyTwoFactor
          heading="Verify to manage release announcements"
          onVerified={() => window.dispatchEvent(new Event("scene:session-check"))}
        />
      ) : (
        <>
          {!record && data && (
            <>
              <h3>Feed health</h3>
              <dl className="feed-health">
                <div>
                  <dt>Arrivals reviewed</dt>
                  <dd>{dateTime(data.status.reviewed_at)}</dd>
                </div>
                <div>
                  <dt>Departures reviewed</dt>
                  <dd>{dateTime(data.status.departure_reviewed_at)}</dd>
                </div>
                <div>
                  <dt>Daily saved-title checks</dt>
                  <dd>
                    {dateTime(data.watchlist?.last_run_at)}
                    <small>
                      {data.watchlist?.checked || 0} checked · {data.watchlist?.failed || 0} failed in last
                      run
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Notification worker</dt>
                  <dd>
                    {dateTime(data.notifications?.last_run_at)}
                    <small>
                      {data.notifications?.sent || 0} sent · {data.notifications?.failed || 0} failed in last
                      run
                    </small>
                  </dd>
                </div>
              </dl>
              <p className="fine-print">{data.status.coverage_note}</p>
              <div className="manager-controls">
                <label>
                  Feed
                  <SelectControl value={type} onChange={(e) => setType(e.target.value as RecordKind)}>
                    <option value="release">Arrivals</option>
                    <option value="departure">Leaving services</option>
                  </SelectControl>
                </label>
                <label>
                  Find a title
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search announcements"
                  />
                </label>
                <button className="button secondary" onClick={add}>
                  Add announcement
                </button>
              </div>
              <div className="release-records">
                {(type === "release" ? data.releases : data.departures)
                  .filter((r) => r.title.toLowerCase().includes(query.toLowerCase()))
                  .map((r) => (
                    <div className="access-row" key={r.id}>
                      <div>
                        <strong>{r.title}</strong>
                        <small>
                          {services.find((s) => s.key === r.service_key)?.name} ·{" "}
                          {r.release_date || r.last_available_date} · {r.active ? "Active" : "Withdrawn"}
                          {!r.tmdb_id ? " · Artwork not matched" : ""}
                        </small>
                      </div>
                      <button onClick={() => edit(r)}>Edit</button>
                    </div>
                  ))}
                {!(type === "release" ? data.releases : data.departures).length && (
                  <p>No verified announcements in this feed yet.</p>
                )}
              </div>
              {data.edits.length > 0 && (
                <details className="recovery-help">
                  <summary>Recent manual edits</summary>
                  {data.edits.map((e, i) => (
                    <p key={i}>
                      {e.title} · {dateTime(e.changed_at)}
                    </p>
                  ))}
                </details>
              )}
            </>
          )}
          {record && (
            <form className="release-editor" onSubmit={save}>
              <h3>{record.updated_at ? "Edit announcement" : "New announcement"}</h3>
              <p className="fine-print">
                Use an official provider announcement that explicitly confirms the UK date. Existing IDs stay
                the same so followers keep their reminders.
              </p>
              <label>
                Title
                <input
                  value={record.title}
                  required
                  maxLength={250}
                  onChange={(e) => update({ title: e.target.value })}
                />
              </label>
              <div className="editor-columns">
                <label>
                  Type
                  <SelectControl
                    value={record.kind}
                    onChange={(e) =>
                      update({
                        kind: e.target.value as "movie" | "series",
                        label: e.target.value === "series" ? "New series" : "New film",
                      })
                    }
                  >
                    <option value="movie">Film</option>
                    <option value="series">TV series</option>
                  </SelectControl>
                </label>
                <label>
                  Original release year
                  <input
                    type="number"
                    min={1888}
                    max={2200}
                    value={record.original_year || ""}
                    onChange={(e) =>
                      update({ original_year: e.target.value ? Number(e.target.value) : null })
                    }
                  />
                </label>
                <label>
                  Service
                  <SelectControl
                    value={record.service_key}
                    onChange={(e) => update({ service_key: e.target.value })}
                  >
                    {services.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                      </option>
                    ))}
                  </SelectControl>
                </label>
                <label>
                  {type === "release" ? "UK arrival date" : "Last UK day available"}
                  <input
                    type="date"
                    required
                    value={(type === "release" ? record.release_date : record.last_available_date) || ""}
                    onChange={(e) =>
                      update(
                        type === "release"
                          ? { release_date: e.target.value }
                          : { last_available_date: e.target.value },
                      )
                    }
                  />
                </label>
              </div>
              {type === "release" && (
                <label>
                  What’s arriving?
                  <input
                    value={record.label || ""}
                    maxLength={60}
                    required
                    placeholder="e.g. Season 2 · new episodes"
                    onChange={(e) => update({ label: e.target.value })}
                  />
                </label>
              )}
              <label>
                Official announcement link
                <input
                  type="url"
                  value={record.source_url}
                  maxLength={1999}
                  required
                  placeholder="https://…"
                  onChange={(e) => update({ source_url: e.target.value })}
                />
              </label>
              {/^https:\/\//.test(record.source_url) && (
                <a className="text-button" href={record.source_url} target="_blank" rel="noopener noreferrer">
                  Open source ↗
                </a>
              )}
              <div className="artwork-editor">
                {record.poster_url && <img src={record.poster_url} alt={"Poster for " + record.title} />}
                <div>
                  <p className="fine-print">
                    {record.tmdb_id ? "TMDB title matched" : "No artwork match saved"}
                  </p>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy || !record.original_year || !record.title.trim()}
                    onClick={artwork}
                  >
                    Find matching artwork
                  </button>
                  {(record.tmdb_id || record.poster_url) && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => update({ tmdb_id: null, poster_url: null })}
                    >
                      Clear artwork match
                    </button>
                  )}
                </div>
              </div>
              <label className="check-filter">
                <input
                  type="checkbox"
                  checked={record.active}
                  onChange={(e) => update({ active: e.target.checked })}
                />
                Show this announcement
              </label>
              <label className="check-filter">
                <input
                  type="checkbox"
                  checked={reviewed}
                  required
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I checked the official source and its UK date today
              </label>
              <div className="modal-footer">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    setRecord(null);
                    setError("");
                    void load();
                  }}
                >
                  Cancel / reload
                </button>
                <button className="button primary" disabled={busy || !reviewed}>
                  {busy ? "Saving…" : "Save announcement"}
                </button>
              </div>
            </form>
          )}
          {!record && (
            <button className="text-button" onClick={load}>
              Refresh dashboard
            </button>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
      {error && (
        <p className="error-notice" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
