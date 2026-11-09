import { catalogueRegion } from "../../../lib/region-server";
import { regionalHandler } from "../../../lib/region-server";
import { parseExtraFilters } from "../../../lib/catalogue-filters";
import { requireSceneMember } from "../../../lib/auth/server";
import { browseTMDB, hasTMDB } from "../../../lib/tmdb";
import { servicesForRegion } from "../../../lib/catalogue";
async function handleGET(req: Request) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  const p = new URL(req.url).searchParams,
    kind = p.get("kind"),
    pageText = p.get("page") || "1",
    provider = p.get("provider") || "all",
    offer = p.get("offer") || "all",
    genre = p.get("genre") || "all",
    sort = p.get("sort") || "recommended",
    mine = p.get("mine") || "0";
  const services = servicesForRegion(catalogueRegion());
  const selected = [...new Set((p.get("services") || "").split(",").filter(Boolean))];
  const known = (key: string) => services.some((s) => s.key === key);
  if (
    !["movie", "tv"].includes(kind || "") ||
    !/^\d{1,3}$/.test(pageText) ||
    Number(pageText) < 1 ||
    Number(pageText) > 500 ||
    (provider !== "all" && !known(provider)) ||
    selected.length > services.length ||
    selected.some((k) => !known(k)) ||
    !["all", "sub", "free", "rent", "buy"].includes(offer) ||
    !["recommended", "newest", "az", "rating"].includes(sort) ||
    !["0", "1"].includes(mine) ||
    genre.length > 80
  )
    return Response.json({ error: "Invalid catalogue filters." }, { status: 400 });
  const extra = parseExtraFilters(p);
  if (!extra) return Response.json({ error: "Invalid extra filters." }, { status: 400 });
  if (!hasTMDB())
    return Response.json({ error: "The full catalogue is not connected yet." }, { status: 503 });
  try {
    return Response.json(
      await browseTMDB({
        kind: kind as "movie" | "tv",
        page: Number(pageText),
        provider,
        selected,
        mine: mine === "1",
        offer,
        genre,
        sort,
        extra,
      }),
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch {
    return Response.json(
      { error: "The catalogue could not load. Please try again shortly." },
      { status: 503 },
    );
  }
}

export const GET = regionalHandler(handleGET);
