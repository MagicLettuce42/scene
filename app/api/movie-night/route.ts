import { requireSceneMember } from "../../../lib/auth/server";
import { browseTMDB, hasTMDB } from "../../../lib/tmdb";
import { services } from "../../../lib/catalogue";
import { noExtraFilters } from "../../../lib/catalogue-filters";
import { validUuid } from "../../../lib/shared-lists";
const reply = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: Request) {
  const auth = await requireSceneMember(req); if (auth.error) return auth.error;
  const p = new URL(req.url).searchParams, id = p.get("listId"), rawPage = p.get("page") || "1";
  if (!validUuid(id) || !/^[1-9]\d?$/.test(rawPage)) return reply({ error: "Choose a valid list." }, 400);
  const state = await auth.client.rpc("scene_movie_night", { p_action: "state", p_data: { listId: id } });
  if (state.error) return reply({ error: "This movie-night session is unavailable." }, 403);
  if (p.get("suggest") !== "1") return reply(state.data);
  const selected = (state.data.commonServices || []).filter((key: string) => services.some(s => s.key === key));
  if (!state.data.ready || !selected.length) return reply({ ...state.data, titles: [], hasMore: false });
  if (!hasTMDB()) return reply({ error: "Movie suggestions are temporarily unavailable." }, 503);
  try {
    const catalogue = await browseTMDB({ kind: "movie", page: Number(rawPage), provider: "all", selected, mine: true,
      offer: "all", genre: "all", sort: "recommended", extra: noExtraFilters() });
    return reply({ ...state.data, titles: catalogue.titles, page: catalogue.page, hasMore: catalogue.hasMore, message: catalogue.message });
  } catch { return reply({ error: "Movie-night suggestions could not load. Please retry." }, 503); }
}
export async function POST(req: Request) {
  const auth = await requireSceneMember(req); if (auth.error) return auth.error;
  let b: any;
  try { const raw = await req.text(); if (raw.length > 3000) return reply({ error: "Request too large." }, 413); b = JSON.parse(raw); }
  catch { return reply({ error: "Check your services." }, 400); }
  if (!validUuid(b?.listId) || !Array.isArray(b.services) || b.services.length > services.length ||
    b.services.some((key: unknown) => !services.some(s => s.key === key))) return reply({ error: "Choose valid services." }, 400);
  const r = await auth.client.rpc("scene_movie_night", { p_action: "share", p_data: { listId: b.listId, services: [...new Set(b.services)] } });
  return r.error ? reply({ error: "Could not update your shared services." }, 403) : reply(r.data);
}
