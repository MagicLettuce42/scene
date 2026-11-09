import { catalogueRegion, runWithRegion } from "../../../../lib/region-server";
import { regionalHandler } from "../../../../lib/region-server";
import { requireSceneMember } from "../../../../lib/auth/server";
import { readReleaseFeed } from "../../../../lib/release-feed";
import { normalizedTitleName } from "../../../../lib/tmdb";
import { londonDate } from "../../../../lib/episode-calendar";
import { getTitle } from "../../../../lib/server-catalogue";
import { serviceArrivalTitle } from "../../../../lib/service-arrivals";
import type { LibraryDocument } from "../../../../lib/library-state";
async function handlePOST(req: Request) {
  const auth = await requireSceneMember(req);
  if (auth.error) return auth.error;
  const reply = (body: unknown, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  let ids: string[];
  try {
    const raw = await req.text();
    if (raw.length > 2000) throw Error();
    const body = JSON.parse(raw);
    if (
      !body ||
      !Array.isArray(body.ids) ||
      !body.ids.length ||
      body.ids.length > 6 ||
      body.ids.some((id: unknown) => typeof id !== "string" || !/^[-\w:]{1,100}$/.test(id as string))
    )
      throw Error();
    ids = [...new Set<string>(body.ids)];
  } catch {
    return reply({ error: "Choose up to six saved titles." }, 400);
  }
  const { data, error } = await auth.client
    .from("scene_libraries")
    .select("payload")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) return reply({ error: "Your saved titles could not load." }, 503);
  const owned = Object.values((data?.payload as LibraryDocument)?.entries || {})
    .filter((e) => e.saved && ids.includes(e.title.id))
    .map((e) => e.title);
  const region = catalogueRegion();
  const feed = await runWithRegion(region, () => readReleaseFeed(auth.client)),
    selected = Object.entries((data?.payload as LibraryDocument)?.services || {})
      .filter(([, v]) => v)
      .map(([k]) => k);
  const results = await Promise.allSettled(
    owned.map((old) => runWithRegion(region, async () => {
      const id = old.id.startsWith("arrival-")
        ? old.id
        : old.tmdbId
          ? `tmdb-${old.kind === "movie" ? "movie" : "tv"}-${old.tmdbId}`
          : old.id;
      const fresh = id.startsWith("arrival-")
        ? await serviceArrivalTitle(id, auth.client)
        : await getTitle(id, old);
      if (!fresh) {
        if (old.id.startsWith("arrival-"))
          return { ...old, upcomingRelease: undefined, live: false, checked: undefined };
        throw Error();
      }
      const upcoming = feed.entries
        .filter(
          (a) =>
            a.date >= londonDate() &&
            a.kind === old.kind &&
            selected.includes(a.service) &&
            (a.tmdbId && fresh.tmdbId
              ? a.tmdbId === fresh.tmdbId
              : normalizedTitleName(a.name) === normalizedTitleName(fresh.name) &&
                (!a.year || a.year === fresh.year)),
        )
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      return {
        ...fresh,
        id: old.id,
        ...(upcoming
          ? {
              upcomingRelease: {
                kind: "streaming" as const,
                region: "GB" as const,
                date: upcoming.date,
                service: upcoming.service,
                label: upcoming.label,
                sourceUrl: upcoming.sourceUrl,
                verifiedOn: upcoming.verifiedOn || feed.reviewedOn,
              },
            }
          : {}),
      };
    })),
  );
  return reply({
    titles: results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    failed: ids.length - results.filter((r) => r.status === "fulfilled").length,
  });
}

export const POST = regionalHandler(handlePOST);
