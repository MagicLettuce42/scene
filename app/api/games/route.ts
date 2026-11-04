import { requireSceneMember } from "../../../lib/auth/server";
import { igdbConfigured, searchIGDB, selectedGameMatches } from "../../../lib/igdb";

export async function GET(request: Request) {
  const access = await requireSceneMember(request);
  if (access.error) return access.error;
  const p = new URL(request.url).searchParams, q = (p.get("q") || "").trim(), raw = p.get("page") || "1";
  if (q.length < 2 || q.length > 100 || /[\u0000-\u001f\u007f]/.test(q) || !/^[1-9]\d?$/.test(raw) || Number(raw) > 50)
    return Response.json({ error: "Enter a game name between 2 and 100 characters and a valid page." }, { status: 400 });
  const page = Number(raw);
  if (igdbConfigured()) {
    try {
      const data = await searchIGDB(q, page);
      const games = page === 1 ? [...new Map([...selectedGameMatches(q), ...data.games].map(game => [game.id, game])).values()] : data.games;
      return Response.json({ games, page, hasMore: page < 50 && data.hasMore, mode: "igdb", message: null }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ games: page === 1 ? selectedGameMatches(q) : [], page, hasMore: false, mode: "selected",
        message: "The wider games database could not connect. Showing matches from Scene’s selected games; try again shortly." }, { headers: { "Cache-Control": "no-store" } });
    }
  }
  return Response.json({ games: page === 1 ? selectedGameMatches(q) : [], page, hasMore: false, mode: "selected",
    message: "Wider games search is not connected yet. Showing Scene’s selected games." }, { headers: { "Cache-Control": "no-store" } });
}
