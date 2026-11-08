export type SessionBoundary = { initialized: boolean; userId: string | null; epoch: number };
let boundary: SessionBoundary = { initialized: false, userId: null, epoch: 0 };
const requests = new Set<AbortController>(),
  listeners = new Set<() => void>();
const marker = "scene.browser-account.v1";
export const sessionBoundary = (): SessionBoundary => boundary;
export function assertSessionBoundary(expected: SessionBoundary) {
  if (!expected.initialized || expected.epoch !== boundary.epoch || expected.userId !== boundary.userId)
    throw new DOMException("Your sign-in changed. Try again in your current account.", "AbortError");
}
function remove(kind: "localStorage" | "sessionStorage", key: string) {
  try {
    globalThis[kind]?.removeItem(key);
  } catch {
    /* Storage may be disabled. */
  }
}
export function setSessionAccount(userId: string | null) {
  if (boundary.initialized && boundary.userId === userId) return;
  let previous = boundary.userId;
  if (!boundary.initialized)
    try {
      previous = sessionStorage.getItem(marker);
    } catch {}
  boundary = { initialized: true, userId, epoch: boundary.epoch + 1 };
  // Abort before notifying the UI so old handlers cannot finish against a new identity.
  for (const request of requests) request.abort();
  requests.clear();
  if (previous && previous !== userId) {
    remove("localStorage", "scene.library." + previous);
    remove("localStorage", "scene.updates.read." + previous);
    remove("sessionStorage", "scene.tabs.v2." + previous);
    remove("sessionStorage", "scene.catalogue-cache.v2." + previous);
    remove("sessionStorage", "scene.recent-searches." + previous);
    for (const key of ["scene.watchlist.v1", "scene.services.v1", "scene.feedback.v1"])
      remove("localStorage", key);
  }
  // Old unscoped cache entries have no provable owner and must not be imported.
  for (const key of ["scene.tabs.v1", "scene.catalogue-cache.v1"]) remove("sessionStorage", key);
  try {
    if (userId) sessionStorage.setItem(marker, userId);
    else sessionStorage.removeItem(marker);
  } catch {}
  for (const notify of listeners) notify();
}
export function onSessionBoundaryChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function trackSessionRequest(controller: AbortController) {
  requests.add(controller);
  return () => {
    requests.delete(controller);
  };
}
