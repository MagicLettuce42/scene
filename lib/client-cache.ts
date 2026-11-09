"use client";
import { clientRegion } from "./region-client";
import { recordQuality } from "./quality";
import { sceneFetch } from "./auth/client";
import {
  assertSessionBoundary,
  onSessionBoundaryChange,
  sessionBoundary,
  type SessionBoundary,
} from "./auth/session-boundary";
// Catalogue metadata is public, but search text and viewing interests belong to an account.
const entries = new Map<string, { at: number; data: unknown }>();
const storageKey = (userId: string) => "scene.catalogue-cache.v2." + userId,
  ttl = 10 * 60 * 1000;
let restoredFor: string | null = null;
onSessionBoundaryChange(() => {
  entries.clear();
  restoredFor = null;
});
function restore() {
  const { userId } = sessionBoundary();
  if (!userId || typeof window === "undefined") return false;
  if (restoredFor === userId) return true;
  entries.clear();
  restoredFor = userId;
  try {
    for (const [key, value] of JSON.parse(sessionStorage.getItem(storageKey(userId)) || "[]"))
      if (typeof key === "string" && value && Date.now() - value.at < ttl) entries.set(key, value);
  } catch {}
  return true;
}
export function readCache<T>(key: string): T | null {
  if (!restore()) return null;
  key = clientRegion() + ":" + key;
  const hit = entries.get(key);
  if (!hit || Date.now() - hit.at >= ttl) {
    entries.delete(key);
    return null;
  }
  return hit.data as T;
}
export function writeCache(key: string, data: unknown, expected: SessionBoundary = sessionBoundary()) {
  assertSessionBoundary(expected);
  if (!expected.userId || !restore()) return;
  key = clientRegion() + ":" + key;
  entries.delete(key);
  entries.set(key, { at: Date.now(), data });
  while (entries.size > 20) entries.delete(entries.keys().next().value!);
  try {
    sessionStorage.setItem(storageKey(expected.userId), JSON.stringify([...entries]));
  } catch {
    /* In-memory caching still works when browser storage is full. */
  }
}
export async function cachedJSON<T>(url: string, signal?: AbortSignal, force = false, cacheIf?: (data: T) => boolean): Promise<T> {
  const region = clientRegion();
  const expected = sessionBoundary(),
    hit = force ? null : readCache<T>(url);
  if (hit) return hit;
  const metric = url.startsWith("/api/search?") ? "search" : url.startsWith("/api/browse?") ? "browse" : null;
  const started = performance.now();
  try {
    const r = await sceneFetch(
        url,
        { signal, ...(force ? { cache: "no-store" as const } : {}) },
        expected.userId || undefined,
      ),
      data = (await r.json()) as T & { error?: string };
    assertSessionBoundary(expected);
    if (region !== clientRegion()) throw new DOMException("Region changed", "AbortError");
    if (!r.ok) throw Error(data.error || "This could not load. Please try again.");
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (!cacheIf || cacheIf(data)) writeCache(url, data, expected);
    if (metric) recordQuality(`${metric}_ok`, performance.now() - started);
    return data;
  } catch (error) {
    if (metric && (error as Error).name !== "AbortError") recordQuality(`${metric}_error`, performance.now() - started);
    throw error;
  }
}
