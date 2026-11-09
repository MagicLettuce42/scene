// Public capability only. Challenges, credentials and account details stay with Auth.
export async function GET() {
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY)
    return reply({ enabled: false }, 503);
  try {
    const response = await fetch(process.env.SUPABASE_URL + "/auth/v1/settings", {
      headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, Accept: "application/json" },
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw Error();
    const settings = await response.json() as { passkeys_enabled?: unknown };
    return reply({ enabled: settings.passkeys_enabled === true });
  } catch { return reply({ enabled: false }, 503); }
}
