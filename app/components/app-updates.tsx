"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import release from "../../lib/app-release.json";
import { fetchAppRelease, refreshAppUrl } from "../../lib/app-updates";

type UpdateState = {
  available: boolean; checking: boolean; refreshing: boolean; message: string;
  check: () => Promise<string | null>; refresh: () => Promise<void>; dismiss: () => void;
};
const Context = createContext<UpdateState>({ available: false, checking: false, refreshing: false, message: "", check: async () => null, refresh: async () => {}, dismiss: () => {} });
export default function AppUpdateProvider({ children }: { children: ReactNode }) {
  const [latest, setLatest] = useState<string | null>(null), [dismissed, setDismissed] = useState<string | null>(null);
  const [checking, setChecking] = useState(false), [refreshing, setRefreshing] = useState(false), [message, setMessage] = useState("");
  const active = useRef(true), request = useRef<Promise<string | null> | null>(null), abort = useRef<AbortController | null>(null);
  const check = useCallback(() => {
    if (request.current) return request.current;
    setChecking(true);
    const controller = new AbortController(); abort.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    const work = (async () => {
      try {
        const id = await fetchAppRelease(controller.signal);
        if (!active.current || abort.current !== controller) return null;
        setLatest(id); setMessage(id === release.id ? "Scene is up to date." : "A Scene update is ready.");
        if ("serviceWorker" in navigator) void navigator.serviceWorker.getRegistration("/").then(registration => registration?.update()).catch(() => {});
        return id;
      } catch {
        if (active.current && abort.current === controller) setMessage("Couldn’t check for updates. Check your connection and try again.");
        return null;
      } finally {
        window.clearTimeout(timeout);
        if (abort.current === controller) { request.current = null; if (active.current) setChecking(false); }
      }
    })();
    request.current = work; return work;
  }, []);
  useEffect(() => {
    active.current = true;
    const url = new URL(window.location.href);
    if (url.searchParams.has("_scene_update")) {
      url.searchParams.delete("_scene_update");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    const visible = () => { if (document.visibilityState === "visible") void check(); };
    visible();
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("online", visible);
    const interval = window.setInterval(visible, 5 * 60 * 1000);
    return () => { active.current = false; abort.current?.abort(); request.current = null; window.clearInterval(interval); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", visible); };
  }, [check]);
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    const id = await check();
    if (id && active.current) window.location.replace(refreshAppUrl(window.location.href, id));
    else if (active.current) setRefreshing(false);
  }
  return <Context.Provider value={{ available: !!latest && latest !== release.id && latest !== dismissed, checking, refreshing, message, check, refresh, dismiss: () => setDismissed(latest) }}>{children}</Context.Provider>;
}

export function AppUpdateNotice({ pending }: { pending: number }) {
  const update = useContext(Context);
  if (!update.available) return null;
  return <section className="app-update-notice" aria-label="Scene update">
    <div><strong>Update available</strong><p>{pending ? "Waiting for your saved changes to sync." : "Finish any edits, then refresh when you’re ready."}</p></div>
    <button className="button secondary" disabled={pending > 0 || update.refreshing || update.checking} onClick={() => { if (!pending) void update.refresh(); }}><RefreshCw size={16}/>{update.refreshing ? "Refreshing…" : "Refresh Scene"}</button>
    <button className="text-button" onClick={update.dismiss}>Later</button>
  </section>;
}
export function AppUpdateSettings({ pending }: { pending: number }) {
  const update = useContext(Context);
  return <section className="app-update-settings">
    <h3>App updates</h3>
    <p className="fine-print">Get the latest Scene without removing it from your Home Screen. Finish any edits before refreshing.</p>
    <div className="inline-actions">
      <button className="button secondary" disabled={update.checking || update.refreshing} onClick={() => void update.check()}>{update.checking ? "Checking…" : "Check for updates"}</button>
      <button className="button secondary" disabled={pending > 0 || update.refreshing || update.checking} onClick={() => { if (!pending) void update.refresh(); }}><RefreshCw size={16}/>{update.refreshing ? "Refreshing…" : "Refresh Scene"}</button>
    </div>
    {pending > 0 && <p className="fine-print">Waiting for your saved changes to sync.</p>}
    <p className="fine-print" role="status">{update.message}</p>
    <p className="fine-print">Your phone controls Home Screen icon updates. Refreshing Scene may not replace an older installed icon.</p>
    <small>Version {release.id.slice(0, 8)}</small>
  </section>;
}
