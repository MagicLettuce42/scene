"use client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { setSessionAccount } from "./session-boundary";
import { fetchForSession } from "./session-request";
let pending: Promise<SupabaseClient> | null = null;
export function getSceneClient(): Promise<SupabaseClient> {
  if (!pending)
    pending = (async () => {
      const r = await fetch("/api/auth/config", { cache: "no-store" }),
        data = (await r.json()) as { url?: string; key?: string };
      if (!r.ok || !data.url || !data.key)
        throw Error("Scene accounts are being set up. Please try again shortly.");
      const client = createClient(data.url, data.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: "scene.auth.v1",
          flowType: "pkce",
        },
      });
      client.auth.onAuthStateChange((_event, session) => {
        setSessionAccount(session?.user.id || null);
      });
      const { data: initial } = await client.auth.getSession();
      setSessionAccount(initial.session?.user.id || null);
      return client;
    })().catch((e) => {
      pending = null;
      throw e;
    });
  return pending;
}
export async function sceneFetch(path: string, options: RequestInit = {}, expectedUserId?: string) {
  const result = await fetchForSession(
    async () => {
      const client = await getSceneClient();
      return (await client.auth.getSession()).data.session;
    },
    path,
    options,
    expectedUserId,
  );
  if ((result.status === 401 || result.status === 403) && path !== "/api/account")
    window.dispatchEvent(new Event("scene:session-check"));
  return result;
}
export async function signOutScene() {
  const client = await getSceneClient();
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const sub = await registration?.pushManager?.getSubscription();
      if (sub) {
        await sceneFetch("/api/reminders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "unsubscribe", endpoint: sub.endpoint }),
          signal: AbortSignal.timeout(4000),
        }).catch(() => {});
        await sub.unsubscribe();
      }
    }
  } catch {
    /* Generic push messages contain no account data. */
  }
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) throw error;
  setSessionAccount(null);
}
