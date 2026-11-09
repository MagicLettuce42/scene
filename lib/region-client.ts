import { resolveRegion, type Region } from "./region";
import { onSessionBoundaryChange } from "./auth/session-boundary";
let current: Region = "GB";
onSessionBoundaryChange(() => { current = "GB"; });
export const clientRegion = () => current;
export function setClientRegion(value: unknown) { current = resolveRegion(value); }
export function isRegionalPath(path: string) {
  return /^\/api\/(?:browse|discover|for-you|search|tonight|people(?:\/following)?|upcoming(?:\/services)?|services\/activity|movie-night|reminders|availability-alerts|library\/refresh)(?:\?|$)/.test(path) || path.startsWith("/api/title/");
}
export function regionalPath(path: string, region = current) {
  if (!isRegionalPath(path)) return path;
  const url = new URL(path, "https://scene.invalid");
  url.searchParams.set("region", region);
  return url.pathname + url.search;
}
