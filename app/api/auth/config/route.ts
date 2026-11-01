export function GET() {
  return Response.json(
    { url: process.env.SUPABASE_URL || null, key: process.env.SUPABASE_PUBLISHABLE_KEY || null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
