export function GET() {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim() || null;
  return Response.json({ siteKey }, { headers: { "Cache-Control": "no-store" } });
}
