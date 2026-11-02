import type { SupabaseClient } from "@supabase/supabase-js";
import { policyVersion } from "../privacy-consent";

export async function finishSceneEmailConfirmation(
  client: SupabaseClient,
  href: string,
  replaceAddress: (address: string) => void,
) {
  const callback = new URL(href), code = callback.searchParams.get("code");
  if (!code) return null;
  // Supabase may return to the Site URL without our optional confirmed marker.
  // Remove the one-time code before awaiting any network request.
  callback.searchParams.delete("code");
  callback.searchParams.delete("confirmed");
  replaceAddress(callback.pathname + callback.search + callback.hash);
  try {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return null;
  } catch {
    // Missing browser verifiers and expired links can still follow a successful
    // email verification. Keep ordinary password sign-in available.
  }
  return "This link could not sign you in automatically. If your email is confirmed, sign in below with your email and password.";
}

export function validRegistrationEmail(email: string) {
  return email.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function resendSceneConfirmation(client: SupabaseClient, email: string, origin: string) {
  if (!validRegistrationEmail(email)) throw Error("Enter a valid email address.");
  const result = await client.auth.resend({
    type: "signup",
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: origin + "/?confirmed=1" },
  }).catch(() => { throw Error("Another confirmation email could not be requested. Please try again later."); });
  if (result.error) {
    if (result.error.status === 429)
      throw Error("Too many attempts. Please wait before requesting another email.");
    if (result.error.code === "email_address_not_authorized")
      throw Error("Email confirmation is not ready for this address yet. Please try again later.");
    // Do not reveal account presence or whether an address is already confirmed.
    if (["user_not_found", "email_not_confirmed", "email_already_confirmed"].includes(result.error.code || "")) return;
    throw Error("Another confirmation email could not be requested. Please try again later.");
  }
}

export function validateRegistration(name: string, email: string, password: string, confirmation: string) {
  if (!name.trim() || name.trim().length > 80) return "Enter a display name (up to 80 characters).";
  if (!validRegistrationEmail(email)) return "Enter a valid email address.";
  if (password.length < 12 || password.length > 128) return "Use a password of 12–128 characters.";
  if (password !== confirmation) return "Your passwords don’t match.";
  return null;
}

export async function registerScene(client: SupabaseClient, values: {
  name: string; email: string; password: string; confirmation: string; origin: string; termsAccepted: boolean;
}) {
  if (values.termsAccepted !== true) throw Error("Agree to the Terms of service before creating your account.");
  const error = validateRegistration(values.name, values.email, values.password, values.confirmation);
  if (error) throw Error(error);
  const result = await client.auth.signUp({
    email: values.email.trim().toLowerCase(), password: values.password,
    options: {
      data: { display_name: values.name.trim(), terms_version: policyVersion, terms_accepted_at: new Date().toISOString() },
      emailRedirectTo: values.origin + "/?confirmed=1",
    },
  });
  if (result.error) {
    if (result.error.status === 429) throw Error("Too many attempts. Wait a moment before trying again.");
    if (result.error.code === "email_address_not_authorized")
      throw Error("Email confirmation is not ready for this address yet. Please try again later.");
    throw Error("Your account could not be created. Check your details and try again.");
  }
  return result.data;
}
