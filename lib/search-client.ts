"use client";
import type { Title } from "./catalogue";
import type { Person } from "./people";
import { sceneFetch } from "./auth/client";
import { readCache, writeCache } from "./client-cache";
import { assertSessionBoundary, onSessionBoundaryChange, sessionBoundary } from "./auth/session-boundary";
import { recordQuality } from "./quality";

export type SearchPage = {
  suggestion?: string | null; interpretation?: string; matchedCount?: number; emptyReason?: string;
  titles: Title[]; page?: number; hasMore?: boolean; people?: Person[];
  peopleHasMore?: boolean; peopleMessage?: string | null; message?: string | null;
};

export async function streamSearch(url: string, signal: AbortSignal,
  onUpdate: (data: SearchPage, complete: boolean) => void, force = false): Promise<void> {
  const expected = sessionBoundary(), hit = force ? null : readCache<SearchPage>(url);
  if (signal.aborted) throw new DOMException("Search cancelled", "AbortError");
  assertSessionBoundary(expected);
  if (hit) { onUpdate(hit, true); return; }
  const abort = new AbortController(), cancel = () => abort.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const stopSession = onSessionBoundaryChange(cancel);
  let timedOut = false, complete = false, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const timeout = setTimeout(() => { timedOut = true; abort.abort(); }, 30000);
  abort.signal.addEventListener("abort", () => { void reader?.cancel().catch(() => {}); }, { once: true });
  const started = performance.now();
  try {
    const response = await Promise.race([
      sceneFetch(url, { signal: abort.signal, cache: "no-store" }, expected.userId || undefined),
      new Promise<never>((_, reject) => {
        const stopped = () => reject(new DOMException("Search cancelled", "AbortError"));
        if (abort.signal.aborted) stopped();
        else abort.signal.addEventListener("abort", stopped, { once: true });
      }),
    ]);
    if (!response.ok || !response.body) throw Error("Search could not connect. Please try again.");
    reader = response.body.getReader();
    const decoder = new TextDecoder(), titles = new Map<number, Title>();
    let buffer = "", page = 1;
    while (!complete) {
      const next = await reader.read();
      if (abort.signal.aborted) throw new DOMException("Search cancelled", "AbortError");
      assertSessionBoundary(expected);
      if (next.done) break;
      buffer += decoder.decode(next.value, { stream: true });
      if (buffer.length > 1_000_000) throw Error("Search response could not be read. Please retry.");
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        assertSessionBoundary(expected);
        if (event.type === "start") {
          page = event.page || 1; onUpdate({ titles: [], page }, false);
        } else if (event.type === "title" && Number.isInteger(event.index) && event.index >= 0 && event.index < 20 && typeof event.title?.id === "string") {
          titles.set(event.index, event.title);
          onUpdate({ titles: [...titles].sort((a, b) => a[0] - b[0]).map(([, title]) => title), page }, false);
        } else if (event.type === "complete" && Array.isArray(event.result?.titles)) {
          complete = true;
          onUpdate(event.result, true);
          // Do not keep partial source failures in the ten-minute browser cache.
          if (!event.result.message) writeCache(url, event.result, expected);
          recordQuality("search_ok", performance.now() - started);
          break;
        } else if (event.type === "error") throw Error(event.message || "Search could not finish. Please retry.");
      }
    }
    if (!complete) throw Error("Search stopped before availability checks finished. Please retry.");
  } catch (error) {
    if (timedOut) {
      recordQuality("search_error", performance.now() - started);
      throw Error("Search is taking too long. Results already checked are shown. Please retry.");
    }
    if ((error as Error).name !== "AbortError") recordQuality("search_error", performance.now() - started);
    throw error;
  } finally {
    clearTimeout(timeout); signal.removeEventListener("abort", cancel); stopSession();
    await reader?.cancel().catch(() => {});
  }
}
