// One authenticated server-to-server setup action. Catalogue credentials never enter the browser or response.
export async function POST(req: Request) {
  const expected = process.env.SCENE_WATCHLIST_WORKER_SECRET || "",
    provided = req.headers.get("x-scene-worker") || "";
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  if (expected.length !== 64 || provided.length !== 64) return reply({ error: "Unauthorized" }, 401);
  const hash = async (s: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([hash(expected), hash(provided)]);
  if (a.reduce((v, x, i) => v | (x ^ b[i]), 0) !== 0) return reply({ error: "Unauthorized" }, 401);
  if (!process.env.TMDB_API_KEY || !process.env.SUPABASE_URL)
    return reply({ error: "Catalogue not configured" }, 503);
  try {
    const response = await fetch(process.env.SUPABASE_URL + "/functions/v1/scene-watchlist-refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-scene-worker": expected },
      body: JSON.stringify({ action: "configure", apiKey: process.env.TMDB_API_KEY }),
      signal: AbortSignal.timeout(20000),
    });
    return response.ok ? reply({ configured: true }) : reply({ error: "Background setup failed" }, 502);
  } catch {
    return reply({ error: "Background setup unavailable" }, 503);
  }
}
