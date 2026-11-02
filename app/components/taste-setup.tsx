"use client";
import { useEffect, useState } from "react";
import { cachedJSON } from "../../lib/client-cache";
import { sameTitle, type Title } from "../../lib/catalogue";
import { Poster } from "./catalogue-cards";
export default function TasteSetup({ onSave, likedTitles, syncStatus, syncMessage, storageWarning }: {
  onSave: (titles: Title[]) => boolean;
  likedTitles: Title[];
  syncStatus: string;
  syncMessage: string;
  storageWarning: boolean;
}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [results, setResults] = useState<Title[]>([]),
    [chosen, setChosen] = useState<Title[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    const q = query.trim(); setResults([]); setError(""); if (!open || q.length < 2) { setBusy(false); return; }
    const controller = new AbortController(); setBusy(true);
    const timer = setTimeout(() => { cachedJSON<{ titles: Title[] }>(`/api/search?q=${encodeURIComponent(q)}&page=1`, controller.signal)
      .then(d => { if (!controller.signal.aborted) setResults(d.titles); })
      .catch(e => { if (!controller.signal.aborted) setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); }); }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open]);
  return <div><details className="taste-setup" open={open} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>Choose five favourites</summary>
    <p className="fine-print">Pick up to five films or series you love. They’ll be added to your likes to improve For you. Select titles, then choose Use these favourites. This does not mark them watched.</p>
    <label>Find a favourite<input type="search" minLength={2} maxLength={100} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search films or series…" /></label>
    {busy && <p role="status">Finding titles…</p>}{error && <p role="alert">{error}</p>}
    <div className="taste-results">{results.map(t => { const picked = chosen.some(c => sameTitle(c, t)); return <button type="button" className="taste-option" key={t.id} aria-pressed={picked}
      disabled={!picked && chosen.length >= 5} onClick={() => setChosen(old => picked ? old.filter(c => !sameTitle(c, t)) : [...old, t])}>
      <span className="taste-poster"><Poster title={t} decorative /></span><span>{t.name} {t.year ? `(${t.year})` : ""}{picked ? " · Selected" : ""}</span>
    </button>; })}</div>
    <p>{chosen.length}/5 chosen{chosen.length > 0 && " · Not saved yet — choose Use these favourites below."}</p>
    <div className="inline-actions">{chosen.map(t => <button type="button" className="text-button" key={t.id} onClick={() => setChosen(old => old.filter(c => !sameTitle(c, t)))}>Remove {t.name}</button>)}</div>
    <button className="button secondary" disabled={!chosen.length} onClick={() => { if (!onSave(chosen)) { setNotice(""); setError("These favourites could not be queued. Check your sign-in and try again; your selection is still here."); return; } setChosen([]); setQuery(""); setOpen(false); setNotice("Favourites added to your likes."); }}>Use these favourites</button>
  </details>
    {(notice || likedTitles.length > 0) && <p role="status" className="fine-print">{notice} {syncStatus === "saved"
      ? "Saved to your account. Discover’s For you suggestions can now update on your selected services."
      : syncStatus === "offline" || syncStatus === "error"
        ? "Not synced to your account yet. Check your connection and library sync status."
        : "Waiting for your library to sync before suggestions update."}
      {syncStatus === "error" && syncMessage ? ` ${syncMessage}` : ""}</p>}
    {storageWarning && syncStatus !== "saved" && <p role="alert">Browser storage is unavailable. Keep this page open until syncing succeeds; queued favourites may otherwise be lost.</p>}
    <details className="taste-saved">
      <summary>Your liked titles ({likedTitles.length})</summary>
      {likedTitles.length ? <ul>{likedTitles.map(t => <li key={t.id}>{t.name}{t.year ? ` (${t.year})` : ""}</li>)}</ul>
        : <p className="fine-print">No likes yet. Choosing a title above is a draft until you use the favourites button.</p>}
      <p className="fine-print">Likes help Discover’s For you section, together with your ratings and filters. They do not change every Discover row or add titles to your watchlist. If For you is hidden, enable it in Home screen settings. You can change a like in the title’s details.</p>
    </details>
  </div>;
}
