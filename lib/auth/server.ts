import { createClient } from "@supabase/supabase-js";
import { readSecurity } from "./security";
export const authConfigured = () => Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY);
export function userClient(token: string) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
}
export async function requireSceneMember(req: Request, options: { allowMfaSetup?: boolean } = {}) {
  const deny = (error: string, status: number, code?: string) => ({
    error: Response.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } }),
    client: null,
    member: null,
    user: null,
    security: null,
  });
  if (!authConfigured()) return deny("Scene accounts are being set up.", 503);
  const value = req.headers.get("authorization") || "",
    token = value.startsWith("Bearer ") ? value.slice(7) : "";
  if (!token || token.length > 12000) return deny("Sign in to Scene to continue.", 401);
  try {
    const client = userClient(token),
      {
        data: { user },
        error,
      } = await client.auth.getUser(token);
    if (error || !user) return deny("Your session has expired. Sign in again.", 401);
    const result = await client.rpc("scene_security_state");
    const security = readSecurity(result.data);
    if (result.error || !security)
      return deny("Your account security could not be checked. Please try again.", 503);
    if (!security.sessionValid) return deny("This session has ended. Sign in again.", 401, "SESSION_REVOKED");
    const { data: member, error: memberError } = await client
      .from("scene_members")
      .select("user_id,email,display_name,role,active")
      .eq("user_id", user.id)
      .maybeSingle();
    if (memberError) return deny("Your account could not be checked. Please try again.", 503);
    if (!member?.active)
      return deny("This account does not have access to Scene. Confirm your email or contact the owner if access was removed.", 403);
    if (!options.allowMfaSetup && !security.allowed)
      return deny(
        "Complete two-factor authentication to continue.",
        403,
        security.enrolled ? "MFA_REQUIRED" : "MFA_SETUP_REQUIRED",
      );
    const path = new URL(req.url).pathname,
      bucket =
        path === "/api/account" || path.startsWith("/api/account/")
          ? "account"
          : path === "/api/library"
            ? "library"
            : path === "/api/shared"
              ? "shared"
              : "catalogue";
    const quota = await client.rpc("scene_consume_api_limit", { p_bucket: bucket });
    if (quota.error || typeof quota.data?.allowed !== "boolean")
      return deny("Scene could not check request limits. Please try again.", 503);
    if (!quota.data.allowed) {
      const denied = deny(
        "You’re making requests too quickly. Wait a moment and try again.",
        429,
        "RATE_LIMITED",
      );
      denied.error.headers.set("Retry-After", String(Math.max(1, Number(quota.data.retryAfter) || 60)));
      return denied;
    }
    return { error: null, client, member, user, security };
  } catch {
    return deny("Your account could not be checked. Please try again.", 503);
  }
}
