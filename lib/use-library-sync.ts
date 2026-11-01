"use client";
import {newCollectionId} from "./collections";
import type { FilterPreset, RecommendationMode } from "./filter-presets";
import type { Person } from "./people";
import type { PersonPreferences } from "./people-following";
import type { GamePlatform, GameStatus } from "./gaming";
import { useEffect, useRef, useState } from "react";
import { services, sameTitle, type Title } from "./catalogue";
import { readFeedback, type FeedbackAction } from "./preferences";
import { sceneFetch } from "./auth/client";
import { assertSessionBoundary, sessionBoundary } from "./auth/session-boundary";
import { type HomePreferences } from "./home-preferences";
import { type ReviewFields } from "./library-state";
import { type ThemeId } from "./themes";
import {
  applyOperations,
  applyMutation,
  canUndoMutation,
  setupOperations,
  emptyLibrary,
  importOperations,
  projectLibrary,
  validateMutation,
  type LibraryDocument,
  type LibraryOperation,
  type Mutation,
} from "./library-state";
type Account = { id: string; role: string };
type Envelope = { base: LibraryDocument; revision: number; pending: Mutation[] };
type Reply = { document: LibraryDocument; revision: number; userId: string; error?: string; undoSkipped?: boolean };
const empty = (): Envelope => ({ base: emptyLibrary(), revision: 0, pending: [] });
const mutation = (operations: LibraryOperation[]): Mutation => ({
  id:
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(
          "",
        ),
  operations,
});
function visible(e: Envelope) {
  return e.pending.reduce((doc, batch) => applyMutation(doc, batch), e.base);
}
function stored(key: string): Envelope | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value?.base?.entries &&
      value.base.services &&
      Array.isArray(value.base.receipts) &&
      Array.isArray(value.pending) &&
      Number.isSafeInteger(value.revision)
      ? value
      : null;
  } catch {
    return null;
  }
}
function initial(account: Account): Envelope {
  if (account.role !== "owner") return empty();
  try {
    if (localStorage.getItem("scene.legacy-imported")) return empty();
  } catch {}
  let saved: Title[] = [],
    selected: string[] = [];
  try {
    const a = JSON.parse(localStorage.getItem("scene.watchlist.v1") || "[]"),
      b = JSON.parse(localStorage.getItem("scene.services.v1") || "[]");
    if (Array.isArray(a)) saved = a.slice(0, 300);
    if (Array.isArray(b)) selected = b.filter((k) => services.some((s) => s.key === k));
  } catch {}
  const valid: LibraryOperation[] = [];
  for (const operation of importOperations(saved, readFeedback(), selected)) {
    const checked = validateMutation({ revision: 0, id: "local-import-check", operations: [operation] });
    if (checked) valid.push(...checked.mutation.operations);
  }
  const pending: Mutation[] = [];
  for (let i = 0; i < valid.length; i += 50) pending.push(mutation(valid.slice(i, i + 50)));
  return { ...empty(), pending };
}
export function useLibrarySync(account: Account) {
  const storageKey = "scene.library." + account.id,
    envelope = useRef<Envelope>(empty()),
    running = useRef(false),
    mounted = useRef(false),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    runRef = useRef<() => void>(() => {});
  const undo = useRef<{ id: string; before: string | null; userId: string; epoch: number; operations: LibraryOperation[] } | null>(null);
  const [undoNotice, setUndoNotice] = useState("");
  const [, render] = useState(0),
    [ready, setReady] = useState(false),
    [loaded, setLoaded] = useState(false),
    [status, setStatus] = useState("connecting"),
    [message, setMessage] = useState(""),
    [storageWarning, setStorageWarning] = useState(false);
  function persist() {
    if (!mounted.current || sessionBoundary().userId !== account.id) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(envelope.current));
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
    render((n) => n + 1);
  }
  async function request(method: "GET" | "POST", body?: unknown) {
    const started = sessionBoundary();
    const r = await sceneFetch(
      "/api/library",
      {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(20000),
      },
      account.id,
    );
    const data = (await r.json()) as Reply;
    assertSessionBoundary(started);
    if ((r.ok || r.status === 409) && data.userId !== account.id)
      throw Error("Your sign-in changed. Reload Scene to continue.");
    return { r, data };
  }
  // Another tab may advance the same account while a request is in flight.
  function acceptSnapshot(data: Reply) {
    const current = envelope.current;
    const base = data.revision >= current.revision ? data.document : current.base;
    envelope.current = {
      base,
      revision: Math.max(data.revision, current.revision),
      pending: current.pending.filter(m => !base.receipts.includes(m.id) && !data.document.receipts.includes(m.id)),
    };
  }
  async function sync() {
    if (running.current || !mounted.current) return;
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    running.current = true;
    setMessage("");
    setStatus(envelope.current.pending.length ? "saving" : "connecting");
    try {
      const first = await request("GET");
      if (!mounted.current) return;
      if (!first.r.ok) throw Error(first.data.error || "Your library could not load.");
      if (first.data.userId !== account.id) throw Error("Your sign-in changed. Reload Scene to continue.");
      setLoaded(true);
      acceptSnapshot(first.data);
      persist();
      let conflicts = 0;
      while (envelope.current.pending.length && mounted.current) {
        setStatus("saving");
        const current = envelope.current,
          batch = current.pending[0],
          { r, data } = await request("POST", { revision: current.revision, ...batch });
        if (!mounted.current) return;
        if (r.status === 409) {
          if (++conflicts > 5) throw Error("Your library is busy on another device. Try syncing again.");
          acceptSnapshot(data);
          persist();
          continue;
        }
        if (!r.ok) throw Error(data.error || "Your changes could not sync.");
        if (data.userId !== account.id) throw Error("Your sign-in changed. Reload Scene to continue.");
        acceptSnapshot(data);
        if (batch.undoOf) setUndoNotice(data.undoSkipped
          ? "Undo was not applied because your library changed. Your newer changes are safe."
          : "Change undone");
        persist();
        conflicts = 0;
      }
      if (mounted.current) setStatus("saved");
    } catch (e) {
      if (mounted.current) {
        setStatus(navigator.onLine ? "error" : "offline");
        setMessage(e instanceof Error ? e.message : "Your changes will sync when the connection returns.");
      }
    } finally {
      running.current = false;
    }
  }
  runRef.current = () => void sync();
  useEffect(() => {
    mounted.current = true;
    undo.current = null;
    setUndoNotice("");
    envelope.current = stored(storageKey) || initial(account);
    persist();
    try {
      if (account.role === "owner" && localStorage.getItem(storageKey))
        localStorage.setItem("scene.legacy-imported", account.id);
    } catch {}
    setReady(true);
    runRef.current();
    const resume = () => {
      if (document.visibilityState === "visible") runRef.current();
    };
    const storage = (e: StorageEvent) => {
      if (e.key !== storageKey) return;
      const incoming = stored(storageKey);
      if (!incoming) return;
      const current = envelope.current,
        base = incoming.revision > current.revision ? incoming : current,
        ids = new Set<string>();
      const pending = [...incoming.pending, ...current.pending].filter((m) => {
        if (ids.has(m.id) || base.base.receipts.includes(m.id)) return false;
        ids.add(m.id);
        return true;
      });
      envelope.current = { ...base, pending };
      render((n) => n + 1);
      runRef.current();
    };
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("storage", storage);
    const poll = setInterval(resume, 60000);
    return () => {
      mounted.current = false;
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("storage", storage);
    };
  }, [account.id]);
  function enqueue(operations: LibraryOperation[], inverse?: LibraryOperation[], undoOf?: string, undoBase?: string | null) {
    if (!mounted.current || sessionBoundary().userId !== account.id) return false;
    try {
      applyOperations(visible(envelope.current), operations);
    } catch (e) {
      setMessage((e as Error).message);
      setStatus("error");
      return false;
    }
    const before = visible(envelope.current).receipts.at(-1) ?? null;
    const batch = { ...mutation(operations), ...(undoOf ? { undoOf, undoBase } : {}) };
    undo.current = inverse?.length ? { id: batch.id, before, userId: account.id, epoch: sessionBoundary().epoch, operations: inverse } : null;
    setUndoNotice("");
    envelope.current = { ...envelope.current, pending: [...envelope.current.pending, batch] };
    persist();
    setStatus(navigator.onLine ? "saving" : "offline");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => runRef.current(), 250);
    return true;
  }
  function undoLastChange() {
    const record = undo.current, boundary = sessionBoundary();
    if (!record || record.userId !== account.id || boundary.userId !== account.id || record.epoch !== boundary.epoch ||
        !canUndoMutation(visible(envelope.current), record.id, record.before)) {
      undo.current = null;
      setUndoNotice("Undo is no longer available. Your newer changes are safe.");
      return false;
    }
    enqueue(record.operations, undefined, record.id, record.before);
    return true;
  }
  return {
    canUndo: Boolean(undo.current && undo.current.userId === account.id && undo.current.epoch === sessionBoundary().epoch &&
      canUndoMutation(visible(envelope.current), undo.current.id, undo.current.before)),
    undoLastChange,
    undoNotice,
    clearUndo: () => { undo.current = null; },
    ...projectLibrary(visible(envelope.current)),
    followPerson: (person: Person, value: boolean) => enqueue([{type:"person-follow",person,value,at:Date.now()}]),
    setPersonPreferences: (id: number, fields: PersonPreferences) => enqueue([{type:"person-preferences",id,fields,at:Date.now()}]),
    markPeopleUpdatesSeen: (ids: number[]) => {const at=Date.now();enqueue(ids.slice(0,20).map(id=>({type:"person-preferences" as const,id,fields:{seenThrough:at},at})));},
    createCollection: (name:string) => {const id=newCollectionId();enqueue([{type:"collection",id,action:"create",name}]);return id;},
    renameCollection: (id:string,name:string) => enqueue([{type:"collection",id,action:"rename",name}]),
    deleteCollection: (id:string) => enqueue([{type:"collection",id,action:"delete"}]),
    collectionMember: (id:string,key:string,value:boolean) => enqueue([{type:"collection-member",id,key,value}]),
    setFilterPreset: (id: string, value: FilterPreset | null) => enqueue([{ type: "filter-preset", id, value }]),
    setRecommendationMode: (value: RecommendationMode) => enqueue([{ type: "recommendation-mode", value }]),
    setSpoilerFree: (value: boolean) => enqueue([{ type: "spoiler-free", value }]),
    setSharePerformance: (value: boolean) => enqueue([{ type: "share-performance", value }]),
    addFavourites: (titles: Title[]) => enqueue(titles.map(title => ({ type: "title" as const, title, fields: { liked: true, hidden: false } }))),
    setAvatar: (value: string | null) => enqueue([{ type: "avatar", value }]),
    setGaming: (value: boolean) => enqueue([{ type: "gaming", value }]),
    setGamePlatform: (key: GamePlatform, value: boolean) => enqueue([{ type: "game-platform", key, value }]),
    setGameStatus: (id: string, value: GameStatus | null) => enqueue([{ type: "game-status", id, value }]),
    ready,
    loaded,
    status,
    message,
    storageWarning,
    pending: envelope.current.pending.length,
    syncNow: () => runRef.current(),
    refreshTitles: (titles: Title[]) => enqueue(titles.map((title) => ({ type: "refresh" as const, title }))),
    setAutoAvailability: (value: boolean) => enqueue([{ type: "auto-availability", value }]),
    setSeasonal: (value: boolean) => enqueue([{ type: "seasonal", value }]),
    setHome: (fields: Partial<HomePreferences>) => enqueue([{ type: "home", fields }]),
    review: (title: Title, fields: ReviewFields) => enqueue([{ type: "review", title, fields }]),
    completeSetup: (selected: string[], theme: ThemeId, gaming: boolean) =>
      enqueue(setupOperations(selected, theme, gaming)),
    track: (title: Title, value: boolean) => enqueue([{ type: "tracking", title, value }]),
    episode: (title: Title, season: number, episodes: number[], value: boolean) => {
      const entry = Object.values(visible(envelope.current).entries).find(e => sameTitle(e.title, title));
      const changed = episodes.filter(n => Boolean(entry?.progress?.episodes[String(season)]?.[String(n)]) !== value);
      if (!changed.length) return;
      const chunks = Array.from({ length: Math.ceil(changed.length / 250) }, (_, i) => changed.slice(i * 250, (i + 1) * 250));
      enqueue(chunks.map(episodes => ({ type: "episode", title, season, episodes, value })), [
        ...chunks.map(episodes => ({ type: "episode" as const, title, season, episodes, value: !value })),
        { type: "tracking", title, value: entry?.progress?.tracking ?? false },
      ]);
    },
    setTheme: (value: ThemeId) => enqueue([{ type: "theme", value }]),
    save: (title: Title, value: boolean) => {
      const saved = Object.values(visible(envelope.current).entries).some(e => sameTitle(e.title, title) && e.saved);
      enqueue([{ type: "title", title, fields: { saved: value } }], saved && !value
        ? [{ type: "title", title, fields: { saved: true } }] : undefined);
    },
    service: (key: string, value: boolean) => enqueue([{ type: "service", key, value }]),
    activity: (title: Title, fields: Partial<Record<FeedbackAction, boolean>>) =>
      enqueue([{ type: "title", title, fields }]),
  };
}
