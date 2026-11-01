import { assertSessionBoundary, sessionBoundary, trackSessionRequest } from "./session-boundary";
type RequestSession = { user: { id: string }; access_token: string } | null;
// Kept separate from the SDK so account-switch races can be tested deterministically.
export async function fetchForSession(
  getSession: () => Promise<RequestSession>,
  path: string,
  options: RequestInit = {},
  expectedUserId?: string,
  transport: typeof fetch = fetch,
) {
  if (!path.startsWith("/api/")) throw Error("Invalid Scene request.");
  const started = sessionBoundary(),
    session = await getSession();
  if (started.initialized) assertSessionBoundary(started);
  const current = sessionBoundary();
  if (
    !session ||
    session.user.id !== current.userId ||
    (expectedUserId && expectedUserId !== session.user.id)
  )
    throw new DOMException("Your sign-in changed. Try again in your current account.", "AbortError");
  assertSessionBoundary(current);
  const controller = new AbortController(),
    release = trackSessionRequest(controller),
    abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  const headers = new Headers(options.headers);
  headers.set("Authorization", "Bearer " + session.access_token);
  try {
    controller.signal.throwIfAborted();
    const response = await transport(path, {
      ...options,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
    assertSessionBoundary(current);
    controller.signal.throwIfAborted();
    return response;
  } finally {
    release();
    options.signal?.removeEventListener("abort", abort);
  }
}
