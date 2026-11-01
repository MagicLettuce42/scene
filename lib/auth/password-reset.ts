import type { SupabaseClient } from "@supabase/supabase-js";
import { validRegistrationEmail } from "./registration";

export async function requestPasswordReset(client: SupabaseClient, email: string, origin: string) {
  if (!validRegistrationEmail(email)) throw Error("Enter a valid email address.");
  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: new URL("/reset-password", origin).href,
  });
  if (error?.status === 429) throw Error("Too many attempts. Wait before requesting another email.");
  if (error) throw Error("A reset email could not be requested. Please try again later.");
}

export async function openPasswordReset(client: SupabaseClient, href: string, replace: (address: string) => void) {
  const url = new URL(href), code = url.searchParams.get("code");
  // Never retain one-time authentication codes in the address bar.
  url.searchParams.delete("code");
  const failed = url.searchParams.has("error") || url.searchParams.has("error_code") || url.hash.includes("error=");
  if (code || failed) replace(url.pathname);
  if (failed) throw Error("This reset link has expired or could not be verified. Request a new email.");
  if (!code) return false;
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error || !data.session) throw Error("This reset link could not be verified. Open it in the same browser where you requested it, or request another email.");
  return true;
}

export async function saveResetPassword(client: SupabaseClient, password: string, confirmation: string) {
  if (password.length < 12 || password.length > 128) throw Error("Use a password of 12–128 characters.");
  if (password !== confirmation) throw Error("Your passwords don’t match.");
  const { error } = await client.auth.updateUser({ password });
  if (error) throw Error("Your password could not be updated. Try a different password or request a fresh reset link.");
}
