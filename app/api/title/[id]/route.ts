import { regionalHandler } from "../../../../lib/region-server";
import { runWithFreshCatalogueData } from "../../../../lib/catalogue-edge-cache";
import { serviceDepartureTitle } from "../../../../lib/service-activity";
import { serviceArrivalTitle } from "../../../../lib/service-arrivals";
import { requireSceneMember } from "../../../../lib/auth/server";
import { getTitle, getDirectOffers } from "../../../../lib/server-catalogue";
import { tmdbDetails, type TitleHint } from "../../../../lib/tmdb";
async function handleGET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  const { id } = await params;
  if (
    !/^(?:(?:tv|wm)-\d{1,12}|(?:film|arrival|departure)-[a-z0-9-]{1,80}|tmdb-(?:movie|tv)-\d{1,12})$/.test(id)
  )
    return Response.json({ error: "Invalid title." }, { status: 400 });
  const p = new URL(req.url).searchParams,
    releaseFormat = p.get("releaseFormat");
  if (releaseFormat && !["cinema", "digital"].includes(releaseFormat))
    return Response.json({ error: "Invalid release type." }, { status: 400 });
  // Older saved records retain their identity while resolving through TMDB.
  // Only bounded title metadata is accepted; no caller-controlled upstream URL.
  let hint: TitleHint | undefined;
  if (/^(wm|tv)-/.test(id) && p.get("name")) {
    const name = p.get("name")!.trim(),
      year = p.get("year"),
      kind = p.get("kind"),
      imdb = p.get("imdb");
    if (
      !name ||
      name.length > 200 ||
      !["movie", "series"].includes(kind || "") ||
      (year && !/^\d{4}$/.test(year)) ||
      (imdb && !/^tt\d{5,12}$/.test(imdb))
    )
      return Response.json({ error: "Invalid title details." }, { status: 400 });
    hint = { name, year: year ? Number(year) : null, kind: kind as "movie" | "series", imdbId: imdb };
  }
  try {
    if (p.get("direct") === "1")
      return Response.json(await getDirectOffers(id, hint), {
        headers: { "Cache-Control": "private, max-age=300" },
      });
    const title = await runWithFreshCatalogueData(p.get("refresh") === "1", async () => id.startsWith("departure-")
      ? await serviceDepartureTitle(id, access.client)
      : id.startsWith("arrival-")
        ? await serviceArrivalTitle(id, access.client)
        : releaseFormat && /^tmdb-movie-/.test(id)
          ? await tmdbDetails("movie", Number(id.split("-")[2]), releaseFormat as "cinema" | "digital")
          : await getTitle(id, hint));
    return title
      ? Response.json({ title }, { headers: { "Cache-Control": "private, max-age=300" } })
      : Response.json({ error: "Title not found." }, { status: 404 });
  } catch {
    return Response.json(
      {
        error:
          p.get("direct") === "1"
            ? "Direct provider links could not be loaded. The standard watch options still work."
            : "Could not refresh this title. Please try again.",
      },
      { status: 503 },
    );
  }
}

export const GET = regionalHandler(handleGET);
