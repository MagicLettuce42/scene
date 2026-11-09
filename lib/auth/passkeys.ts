"use client";
import { getSceneClient, sceneFetch } from "./client";
import { assertSessionBoundary, onSessionBoundaryChange, sessionBoundary } from "./session-boundary";
import { readSecurity } from "./security";

export type ScenePasskey = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };
export function supportsPasskeys() {
  return typeof window !== "undefined" && window.isSecureContext === true &&
    typeof window.PublicKeyCredential === "function" && typeof navigator.credentials?.create === "function" && typeof navigator.credentials?.get === "function";
}
export function passkeyMessage(error: unknown, action: "signin" | "manage" = "manage") {
  const e = error as { code?: string; name?: string; cause?: { name?: string }; status?: number };
  if (e?.code === "passkey_disabled") return "Passkeys have not been enabled for Scene yet. Password sign-in is still available.";
  if (e?.code === "too_many_passkeys") return "Your account has reached its passkey limit. Remove an unused passkey first.";
  if (e?.code === "webauthn_credential_exists") return "This passkey is already registered. You can use it to sign in.";
  if (e?.code === "email_not_confirmed") return "Confirm your email address before adding or using a passkey.";
  if (e?.code === "insufficient_aal" || e?.code === "mfa_verification_required") return "Complete your two-factor verification, then try again.";
  if (e?.status === 429) return "Too many attempts. Wait a moment before trying again.";
  if (e?.code === "webauthn_challenge_expired") return "The passkey request expired. Try again for a fresh request.";
  if ([e?.name, e?.cause?.name].some(n => n === "AbortError" || n === "NotAllowedError") || e?.code === "ERROR_CEREMONY_ABORTED")
    return action === "signin" ? "Passkey sign-in was cancelled. Try again or use your password." : "The passkey request was cancelled. You can try again.";
  return action === "signin" ? "Passkey sign-in could not finish. Try again or use your password. Set up your first passkey in Security & sessions after signing in." : "Your passkey change could not be confirmed. Refresh the list before trying again.";
}
export async function signInWithScenePasskey(signal: AbortSignal, captchaToken?: string) {
  if (!supportsPasskeys()) throw Error("Passkeys are not supported in this browser.");
  const client = await getSceneClient();
  signal.throwIfAborted();
  const result = await client.auth.signInWithPasskey({ options: { signal, ...(captchaToken ? { captchaToken } : {}) } });
  if (result.error) throw result.error;
  if (!result.data?.session || !result.data.user) throw Error("Sign-in did not complete.");
}
// Abort biometric prompts on account change. A completed challenge is still
// verified by Auth against its owning user, RP domain and one-use challenge.
export async function manageScenePasskeys(
  userId: string,
  operation: { action: "list" } | { action: "register"; signal: AbortSignal } |
    { action: "rename"; id: string; name: string } | { action: "remove"; id: string },
) {
  const expected = sessionBoundary();
  if (expected.userId !== userId) throw new DOMException("Account changed", "AbortError");
  assertSessionBoundary(expected);
  const abort = new AbortController(), stop = onSessionBoundaryChange(() => abort.abort());
  const cancel = () => abort.abort();
  if (operation.action === "register") {
    operation.signal.addEventListener("abort", cancel, { once: true });
    if (operation.signal.aborted) abort.abort();
  }
  try {
    const check = await sceneFetch("/api/account", { signal: abort.signal }, userId);
    const account = await check.json() as { id?: string; security?: unknown };
    assertSessionBoundary(expected);
    if (!check.ok || account.id !== userId || !readSecurity(account.security)?.allowed) throw Error("Account verification required");
    const client = await getSceneClient(), session = await client.auth.getSession();
    assertSessionBoundary(expected); abort.signal.throwIfAborted();
    if (session.data.session?.user.id !== userId) throw new DOMException("Account changed", "AbortError");
    if (operation.action === "list") {
      const result = await client.auth.passkey.list();
      assertSessionBoundary(expected);
      if (result.error) throw result.error;
      return result.data || [];
    }
    if (operation.action === "register") {
      if (!supportsPasskeys()) throw Error("Passkeys are not supported in this browser.");
      const result = await client.auth.registerPasskey({ options: { signal: abort.signal } });
      assertSessionBoundary(expected);
      if (result.error) throw result.error;
      if (!result.data?.id) throw Error("Passkey was not confirmed");
    } else if (operation.action === "rename") {
      const name = operation.name.trim();
      if (!name || name.length > 120) throw Error("Use a passkey name of 1–120 characters.");
      const result = await client.auth.passkey.update({ passkeyId: operation.id, friendlyName: name });
      assertSessionBoundary(expected);
      if (result.error) throw result.error;
    } else {
      const result = await client.auth.passkey.delete({ passkeyId: operation.id });
      assertSessionBoundary(expected);
      if (result.error) throw result.error;
    }
    return null;
  } finally {
    stop();
    if (operation.action === "register") operation.signal.removeEventListener("abort", cancel);
  }
}
