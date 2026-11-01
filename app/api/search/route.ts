import { requireSceneMember } from "../../../lib/auth/server";
import { searchCatalogue } from "../../../lib/server-catalogue";
export async function GET(req: Request) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  const started = performance.now();
  const p = new URL(req.url).searchParams, q = (p.get("q") || "").trim(), rawPage = p.get("page") || "1";
  if (!/^\d{1,3}$/.test(rawPage) || Number(rawPage) < 1 || Number(rawPage) > 500)
    return Response.json({ error: "Choose a valid search page." }, { status: 400 });
  const page = Number(rawPage);
  if (q.length < 2 || q.length > 100)
    return Response.json(
      { error: "Enter a title or person’s name between 2 and 100 characters." },
      { status: 400 },
    );
  try {
  const catalogue = await searchCatalogue(q, page);
  return Response.json({ people: [], peopleHasMore: false, peopleMessage: null, ...catalogue, page, hasMore: "hasMore" in catalogue && catalogue.hasMore === true },
    { headers: { "Cache-Control": "private, max-age=300", "Server-Timing": `search;dur=${Math.round(performance.now() - started)}` } });
  } catch { return Response.json({ error: "More search results could not load. Please retry." }, { status: 503 }); }
}
