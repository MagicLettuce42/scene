"use client";
import { sceneFetch } from "./auth/client";
export async function sharedRequest<T>(
  body?: Record<string, unknown>,
  id?: string,
  signal?: AbortSignal,
): Promise<T> {
  const r = await sceneFetch("/api/shared" + (id ? "?id=" + encodeURIComponent(id) : ""), {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: signal || AbortSignal.timeout(20000),
  });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw Error(data.error || "Shared lists could not connect. Try again.");
  return data;
}
