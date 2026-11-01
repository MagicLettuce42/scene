"use client";
import { useEffect, useRef, useState } from "react";
import { sceneFetch } from "../../lib/auth/client";
import { services, type Title } from "../../lib/catalogue";
import { Poster } from "./catalogue-cards";
type State = { people: { id: string; name: string; services: string[] }[]; ready: boolean; commonServices: string[];
  titles?: Title[]; hasMore?: boolean; page?: number; message?: string };
export default function MovieNight({ listId, accountId, onAdd, onOpen }: {
  listId: string; accountId: string; onAdd: (title: Title) => Promise<void>; onOpen: (title: Title) => void;
}) {
  const [open, setOpen] = useState(false), [state, setState] = useState<State | null>(null), [choices, setChoices] = useState<string[]>([]),
    [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  async function load(suggest = false, page = 1, share?: string[]) {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await sceneFetch("/api/movie-night" + (share ? "" : "?" + new URLSearchParams({ listId, suggest: suggest ? "1" : "0", page: String(page) })),
        share ? { method: "POST", signal: abort.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listId, services: share }) } : { signal: abort.signal });
      const d: any = await r.json(); if (!r.ok) throw Error(d.error); if (abort.signal.aborted) return;
      setState(d); if (!suggest) setChoices(d.people.find((p: any) => p.id === accountId)?.services || []);
      if (share) setNotice(share.length ? "These services are now shared with this list." : "You stopped sharing your services.");
    } catch (e) { if (!abort.signal.aborted) setError((e as Error).message); }
    finally { if (!abort.signal.aborted) setBusy(false); }
  }
  useEffect(() => { if (open) void load(); return () => controller.current?.abort(); }, [open, listId, accountId]);
  return <details className="movie-night" open={open} onToggle={e => setOpen(e.currentTarget.open)}><summary>Find a film for everyone</summary>
    <p>Each person chooses which services to share with this list. Scene suggests films on services everyone has chosen. Your personal watchlist and history are never used.</p>
    {open && <><fieldset disabled={busy}><legend>Services I can use for this movie night</legend><div className="movie-service-choices">
      {services.map(s => <label key={s.key}><input type="checkbox" checked={choices.includes(s.key)} onChange={e => setChoices(old => e.target.checked ? [...old, s.key] : old.filter(k => k !== s.key))} />{s.name}</label>)}
    </div></fieldset>
    <div className="inline-actions"><button className="button secondary" disabled={busy || !choices.length} onClick={() => load(false, 1, choices)}>Share these services with this list</button>
      <button className="text-button" disabled={busy} onClick={() => load(false, 1, [])}>Stop sharing</button>
      <button className="text-button" disabled={busy} onClick={() => load()}>Refresh people</button></div>
    {state && <><ul>{state.people.map(p => <li key={p.id}>{p.id === accountId ? "You" : p.name}: {p.services.length ? p.services.map(k => services.find(s => s.key === k)?.name).join(", ") : "Hasn’t shared services yet"}</li>)}</ul>
      {!state.ready ? <p>At least two people must join, and everyone must share their choices before Scene suggests a shortlist.</p> : !state.commonServices.length ? <p>No service is shared by everyone yet. Consider free services you all use, or update the choices above.</p> : <>
        <p><strong>Services in common:</strong> {state.commonServices.map(k => services.find(s => s.key === k)?.name).join(", ")}</p>
        <button className="button primary" disabled={busy} onClick={() => load(true, state.titles ? (state.hasMore ? (state.page || 1) + 1 : 1) : 1)}>{busy ? "Finding films…" : state.titles ? "Show another shortlist" : "Find our shortlist"}</button>
      </>}
      {state.message && <p role="status">{state.message}</p>}
      {state.titles && !state.titles.length && <p>No films matched this batch. Try another shortlist.</p>}
      <div className="movie-night-grid">{state.titles?.slice(0, 12).map(t => <article key={t.id}>
        <button className="movie-night-poster" onClick={() => onOpen(t)}><Poster title={t} /><span>{t.name}</span></button>
        <button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await onAdd(t); setNotice(`Added ${t.name}. Vote for it in the list below.`); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Add to our vote</button>
      </article>)}</div>
    </>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}{busy && <p role="status">Updating movie night…</p>}
    </>}
  </details>;
}
