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
export const isGameId = (value: unknown): value is string =>
  typeof value === "string" && knownIds.includes(value);
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
  return game.date < today
    ? `Announced for ${date} · check release`
    : game.date === today
      ? `Expected today · ${date}`
      : `Expected ${date}`;
}
