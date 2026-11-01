import { requireSceneMember } from "../../../lib/auth/server";
import { hasTMDB, searchPeopleTMDB, personFilmographyTMDB } from "../../../lib/tmdb";
import { services } from "../../../lib/catalogue";
import type { PersonRole } from "../../../lib/people";
const reply = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: Request) {
  const auth = await requireSceneMember(req);
  if (auth.error) return auth.error;
  if (!hasTMDB()) return reply({ error: "People discovery is temporarily unavailable." }, 503);
  const q = new URL(req.url).searchParams,
    person = q.get("person"),
    page = Number(q.get("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100) return reply({ error: "Invalid page." }, 400);
  try {
    if (person !== null) {
      const id = Number(person),
        role = q.get("role") || "all",
        selected = [...new Set((q.get("services") || "").split(",").filter(Boolean))];
      if (
        !Number.isSafeInteger(id) ||
        id < 1 ||
        !["all", "acting", "directing"].includes(role) ||
        selected.some((k) => !services.some((s) => s.key === k))
      )
        return reply({ error: "Invalid filmography request." }, 400);
      return reply(await personFilmographyTMDB(id, selected, role as PersonRole, page));
    }
    const query = (q.get("q") || "").trim();
    if (query.length < 2 || query.length > 100)
      return reply({ error: "Enter a name between 2 and 100 characters." }, 400);
    return reply(await searchPeopleTMDB(query, page));
  } catch {
    return reply({ error: "People discovery could not load. Please try again." }, 503);
  }
}
