import knownIds from "./game-ids.json";
export const gamePlatforms = [
  { id: "ps5", label: "PlayStation 5", short: "PS5" },
  { id: "xbox", label: "Xbox Series X|S", short: "Xbox Series X|S" },
  { id: "pc", label: "PC", short: "PC" },
  { id: "switch2", label: "Nintendo Switch 2", short: "Switch 2" },
  { id: "switch", label: "Nintendo Switch", short: "Switch" },
] as const;
export type GamePlatform = (typeof gamePlatforms)[number]["id"];
export type GameStatus = "later" | "playing" | "finished";
export type GameCollection = Record<string, GameStatus>;
export type GameSearchPage = { games: Game[]; page: number; hasMore: boolean; mode: "igdb" | "selected"; message: string | null };
export const gameStatuses = [
  { id: "later", label: "Play later" },
  { id: "playing", label: "Playing" },
  { id: "finished", label: "Finished" },
] as const;
export type Game = {
  id: string;
  name: string;
  aliases?: string[];
  summary: string;
  genre: string;
  platforms: GamePlatform[];
  platformNames?: string[];
  source?: "igdb";
  released: boolean;
  date?: string;
  edition?: string;
  sourceUrl: string;
  image: string;
  imageFit?: "contain";
  checked: string;
};
export const isGamePlatform = (value: unknown): value is GamePlatform =>
  gamePlatforms.some((p) => p.id === value);
export const isGameStatus = (value: unknown): value is GameStatus => gameStatuses.some((s) => s.id === value);
export const isRemoteGameId = (value: unknown): value is string => typeof value === "string" && /^igdb-[1-9]\d{0,9}$/.test(value);
export const isGameId = (value: unknown): value is string =>
  typeof value === "string" && (knownIds.includes(value) || isRemoteGameId(value));
export const gamePlatformLabels = (game: Game) => game.platformNames?.length ? game.platformNames : game.platforms.map(id => gamePlatforms.find(p => p.id === id)!.short);
export function cleanGameSnapshot(value: unknown): Game | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const text = (s: unknown, max: number) => typeof s === "string" ? s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";
  if (!isRemoteGameId(v.id) || v.source !== "igdb" || !text(v.name, 200)) return null;
  let sourceUrl: string;
  try {
    const url = new URL(String(v.sourceUrl));
    if (url.protocol !== "https:" || url.hostname !== "www.igdb.com" || !/^\/games\/[a-z0-9-]+\/?$/.test(url.pathname) || url.username || url.password) return null;
    sourceUrl = url.origin + url.pathname;
  } catch { return null; }
  const image = text(v.image, 300);
  if (image && !/^https:\/\/images\.igdb\.com\/igdb\/image\/upload\/t_cover_big\/[a-zA-Z0-9_]+\.jpg$/.test(image)) return null;
  const date = text(v.date, 10);
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) return null;
  return { id: v.id, source: "igdb", name: text(v.name, 200), summary: text(v.summary, 1000),
    genre: text(v.genre, 80) || "Other", platforms: Array.isArray(v.platforms) ? [...new Set(v.platforms.filter(isGamePlatform))] : [],
    platformNames: Array.isArray(v.platformNames) ? [...new Set(v.platformNames.map(p => text(p, 60)).filter(Boolean))].slice(0, 20) : [],
    released: v.released === true, ...(date ? { date } : {}), edition: text(v.edition, 120) || undefined,
    sourceUrl, image, checked: text(v.checked, 40) };
}
export function cleanGameSnapshots(value: unknown): Record<string, Game> {
  const out: Record<string, Game> = Object.create(null);
  if (value && typeof value === "object" && !Array.isArray(value))
    for (const [id, entry] of Object.entries(value).slice(0, 500)) { const game = cleanGameSnapshot(entry); if (game?.id === id) out[id] = game; }
  return out;
}
export function cleanGameCollection(value?: GameCollection): GameCollection {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([id, status]) => isGameId(id) && isGameStatus(status)),
  );
}

export function gameReleaseLabel(game: Game, today: string) {
  if (game.released) return "Out now";
  if (!game.date) return "Date to be announced";
  const date = new Date(game.date + "T12:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
  if (game.source === "igdb" && game.date < today) return `Release listed ${date}`;
  return game.date < today
    ? `Announced for ${date} · check release`
    : game.date === today
      ? `Expected today · ${date}`
      : `Expected ${date}`;
}
