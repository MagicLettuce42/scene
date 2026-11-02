import { AsyncLocalStorage } from "node:async_hooks";

type Context = { origin: string; waitUntil: (task: Promise<unknown>) => void };
type EdgeCache = {
  match: (key: Request) => Promise<Response | undefined>;
  put: (key: Request, value: Response) => Promise<unknown>;
};
const contexts = new AsyncLocalStorage<Context>();
const ttlSeconds = 900;
const appendFields = new Set(["watch/providers", "external_ids", "release_dates", "videos", "credits", "recommendations", "combined_credits"]);
function publicData(value: unknown): value is object {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && !("status_code" in value) && !("success" in value && value.success === false);
}

export function runWithCatalogueEdgeCache<T>(request: Request, context: { waitUntil: (task: Promise<unknown>) => void }, run: () => T): T {
  return contexts.run({ origin: new URL(request.url).origin, waitUntil: task => context.waitUntil(task) }, run);
}

// Only raw, public TMDB endpoints are eligible. Never key from an incoming
// account request, API credential, search text, recommendation seed list or JWT.
export async function publicCatalogueCacheKey(origin: string, path: string, params: Record<string, string>): Promise<Request | null> {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.hostname.endsWith(".workers.dev") || url.hostname === "localhost" || url.hostname === "terminal.local") return null;
  const detail = /^(movie|tv|person)\/[1-9]\d{0,12}$/.test(path);
  const season = /^tv\/[1-9]\d{0,12}\/season\/(0|[1-9]\d{0,3})$/.test(path);
  const related = /^(movie|tv)\/[1-9]\d{0,12}\/(similar|recommendations)$/.test(path);
  const genres = /^genre\/(movie|tv)\/list$/.test(path);
  const providers = /^watch\/providers\/(movie|tv)$/.test(path);
  if (!detail && !season && !related && !genres && !providers) return null;
  const query = new URLSearchParams({ language: "en-GB", ...params });
  for (const [name, value] of query) {
    if (name === "language" && /^[a-z]{2}-[A-Z]{2}$/.test(value)) continue;
    if (providers && name === "watch_region" && /^[A-Z]{2}$/.test(value)) continue;
    if (related && name === "page" && /^[1-9]\d{0,2}$/.test(value)) continue;
    if (detail && name === "append_to_response" && value.split(",").every(field => appendFields.has(field))) continue;
    return null;
  }
  query.sort();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(path + "?" + query));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  // The internal cache entry is separate from every authenticated /api route.
  return new Request(new URL("/__scene-cache/public-tmdb-v1/" + hash, url.origin), { method: "GET" });
}

export async function withPublicCatalogueCache<T>(path: string, params: Record<string, string>, load: () => Promise<T>, onCacheHit?: (cachedAt: number) => void): Promise<T> {
  const context = contexts.getStore();
  if (!context) return load();
  let cache: EdgeCache | undefined, key: Request | null = null;
  try {
    key = await publicCatalogueCacheKey(context.origin, path, params);
    if (key && typeof caches !== "undefined") cache = (caches as CacheStorage & { default?: EdgeCache }).default;
    if (key && cache) {
      const hit = await cache.match(key);
      if (hit?.ok && hit.headers.get("Content-Type")?.includes("application/json")) {
        const stored = await hit.json() as { expiresAt?: number; value?: T };
        if (typeof stored.expiresAt === "number" && stored.expiresAt > Date.now() && stored.expiresAt <= Date.now() + ttlSeconds * 1000 && publicData(stored.value)) {
          onCacheHit?.(stored.expiresAt - ttlSeconds * 1000);
          return stored.value;
        }
      }
    }
  } catch {
    // Missing cache support, corrupt entries and cache outages must not block
    // catalogue reads. The caller's existing memory cache also stays in place.
  }
  const value = await load(); // Upstream failures propagate and are never cached.
  if (cache && key && publicData(value)) {
    try {
      const stored = Response.json({ expiresAt: Date.now() + ttlSeconds * 1000, value }, {
        headers: { "Cache-Control": `public, max-age=${ttlSeconds}` },
      });
      context.waitUntil(cache.put(key, stored).catch(() => {}));
    } catch {
      // Cache writes are optional and never change a successful response.
    }
  }
  return value;
}
