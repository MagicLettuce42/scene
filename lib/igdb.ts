import { games, searchGames } from "./gaming";
import { cleanGameSnapshot, type Game, type GamePlatform } from "./gaming-state";

const fields = "id,name,slug,summary,first_release_date,game_status.status,game_type.type,version_title,genres.name,platforms.name,platforms.slug,cover.image_id,websites.url,themes";
const searches = new Map<string, { at: number; games: Game[]; hasMore: boolean }>();
const details = new Map<string, { at: number; game: Game }>();
const pending = new Map<string, Promise<any>>();
let nextCall = 0;
let activeCalls = 0;
let token: { value: string; expires: number; client: string; secret: string } | undefined;
let tokenJob: Promise<string> | undefined;
export const igdbConfigured = () => Boolean(process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET);
const failure = () => Error("The games database is temporarily unavailable. Please try again.");
async function accessToken() {
  const client = process.env.IGDB_CLIENT_ID || "", secret = process.env.IGDB_CLIENT_SECRET || "";
  if (!client || !secret) throw failure();
  if (token?.client === client && token.secret === secret && token.expires > Date.now() + 60000) return token.value;
  if (!tokenJob) tokenJob = (async () => {
    try {
      const response = await fetch("https://id.twitch.tv/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: client, client_secret: secret, grant_type: "client_credentials" }), signal: AbortSignal.timeout(6000) });
      if (!response.ok) throw failure();
      const value = await response.json() as { access_token?: string; expires_in?: number };
      if (!value.access_token || !Number.isFinite(value.expires_in) || value.expires_in! <= 60) throw failure();
      token = { value: value.access_token, expires: Date.now() + value.expires_in! * 1000, client, secret };
      return token.value;
    } catch { throw failure(); }
  })().finally(() => { tokenJob = undefined; });
  return tokenJob;
}
async function query(body: string): Promise<any[]> {
  if (pending.has(body)) return pending.get(body);
  const job = (async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const bearer = await accessToken(), start = Math.max(Date.now(), nextCall);
        // Avoid growing an unbounded queue during a burst of searches.
        if (start - Date.now() > 3000) throw failure();
        nextCall = start + 300;
        if (start > Date.now()) await new Promise(resolve => setTimeout(resolve, start - Date.now()));
        if (activeCalls >= 8) throw failure();
        activeCalls++;
        try {
          const response = await fetch("https://api.igdb.com/v4/games", { method: "POST", headers: { Accept: "application/json", "Client-ID": process.env.IGDB_CLIENT_ID!, Authorization: `Bearer ${bearer}` }, body, signal: AbortSignal.timeout(6000) });
          if (response.status === 401 && attempt === 0) { token = undefined; continue; }
          if (!response.ok) throw failure();
          const data = await response.json();
          if (!Array.isArray(data)) throw failure();
          return data;
        } finally { activeCalls--; }
      }
      throw failure();
    } catch { throw failure(); }
  })();
  pending.set(body, job);
  try { return await job; } finally { pending.delete(body); }
}
const nameKey = (value: string) => value.normalize("NFKD").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]/g, "");
export function normalizeIGDB(row: any): Game | null {
  if (Array.isArray(row?.themes) && row.themes.includes(42)) return null;
  if (!Number.isSafeInteger(row?.id) || row.id < 1 || row.id > 9999999999 || typeof row.name !== "string" || !/^[a-z0-9-]+$/.test(row.slug || "")) return null;
  // Preserve existing saves only when the edition identity is unambiguous.
  const urls: string[] = (Array.isArray(row.websites) ? row.websites : []).map((w: any) => w.url).filter((url: unknown) => typeof url === "string");
  const steam = urls.map(url => { try { const u = new URL(url); return u.hostname === "store.steampowered.com" ? u.pathname.match(/^\/app\/(\d+)/)?.[1] : undefined; } catch { return undefined; } }).filter(Boolean);
  const exactSteam = games.find(g => steam.some(id => g.sourceUrl.match(/^https:\/\/store\.steampowered\.com\/app\/(\d+)/)?.[1] === id));
  const main = String(row.game_type?.type || "").toLowerCase().replace(/[_ ]/g, "") === "maingame";
  const named = main ? games.filter(g => !g.edition && nameKey(g.name) === nameKey(row.name)) : [];
  if (exactSteam || named.length === 1) return exactSteam || named[0];
  const names: string[] = (Array.isArray(row.platforms) ? row.platforms : []).map((p: any) => typeof p.name === "string" ? p.name : "").filter(Boolean).slice(0, 20);
  const mapping: Record<string, GamePlatform> = { playstation5: "ps5", xboxseriesxs: "xbox", xboxseriesxands: "xbox", pcmicrosoftwindows: "pc", windows: "pc", nintendoswitch: "switch", nintendoswitch2: "switch2" };
  const platforms = [...new Set(names.map(name => mapping[nameKey(name)]).filter(Boolean))];
  const rawDate = Number(row.first_release_date);
  const date = rawDate > 0 && rawDate < 4133980800 ? new Date(rawDate * 1000).toISOString().slice(0, 10) : undefined;
  const status = String(row.game_status?.status || "").toLowerCase();
  const type = typeof row.game_type?.type === "string" && !main ? row.game_type.type : "";
  const imageId = typeof row.cover?.image_id === "string" && /^[a-zA-Z0-9_]{1,100}$/.test(row.cover.image_id) ? row.cover.image_id : "";
  return cleanGameSnapshot({ id: `igdb-${row.id}`, source: "igdb", name: row.name, summary: row.summary,
    genre: row.genres?.[0]?.name || "Other", platforms, platformNames: names, released: status === "released",
    date, edition: [type, row.version_title].filter(v => typeof v === "string" && v).join(" · "),
    sourceUrl: `https://www.igdb.com/games/${row.slug}`, image: imageId ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg` : "", checked: new Date().toISOString() });
}
function remember(game: Game) {
  if (details.size >= 300) details.delete(details.keys().next().value!);
  details.set(game.id, { at: Date.now(), game });
}
export async function searchIGDB(q: string, page: number) {
  const key = q.normalize("NFKC").toLowerCase() + ":" + page, hit = searches.get(key);
  if (hit && Date.now() - hit.at < 600000) return hit;
  const rows = await query(`search ${JSON.stringify(q)}; fields ${fields}; where (themes = null | themes != (42)); limit 21; offset ${(page - 1) * 20};`);
  const out = rows.slice(0, 20).map(normalizeIGDB).filter((g): g is Game => !!g);
  out.forEach(remember);
  const value = { at: Date.now(), games: [...new Map(out.map(g => [g.id, g])).values()], hasMore: rows.length > 20 };
  if (searches.size >= 100) searches.delete(searches.keys().next().value!);
  searches.set(key, value);
  return value;
}
export async function igdbGameDetails(ids: string[]): Promise<Map<string, Game>> {
  const result = new Map<string, Game>(), missing = ids.filter(id => { const hit = details.get(id); if (hit && Date.now() - hit.at < 21600000) { result.set(id, hit.game); return false; } return true; });
  if (missing.length > 20 || missing.some(id => !/^igdb-[1-9]\d{0,9}$/.test(id))) throw failure();
  if (missing.length) {
    const rows = await query(`fields ${fields}; where id = (${missing.map(id => id.slice(5)).join(",")}) & (themes = null | themes != (42)); limit 20;`);
    for (const row of rows) { const game = normalizeIGDB(row); if (game && missing.includes(game.id)) { remember(game); result.set(game.id, game); } }
  }
  return result;
}
export const selectedGameMatches = (q: string) => searchGames(q, true);
