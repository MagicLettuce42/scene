export function releaseId(value: unknown): string | null {
  const id = value && typeof value === "object" ? (value as { id?: unknown }).id : null;
  return typeof id === "string" && /^[a-f0-9]{20}$/.test(id) ? id : null;
}
export async function fetchAppRelease(signal: AbortSignal): Promise<string> {
  const response = await fetch("/api/app-version", { cache: "no-store", credentials: "same-origin", signal });
  if (!response.ok) throw new Error("Update check failed");
  const id = releaseId(await response.json());
  if (!id) throw new Error("Invalid update response");
  return id;
}
export function refreshAppUrl(href: string, id: string) {
  const url = new URL(href);
  url.searchParams.set("_scene_update", id);
  return url.href;
}
