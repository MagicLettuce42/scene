import catalogue from "./game-catalogue.json";
import { gamePlatforms, gameStatuses, type Game, type GamePlatform, type GameStatus, type GameCollection } from "./gaming-state";
export * from "./gaming-state";
export const games = catalogue as Game[];
export function searchGames(query: string, enabled: boolean): Game[] {
  const normalise = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[’']/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const q = normalise(query);
  return enabled && q.length >= 2
    ? games.filter((g) => {
        const names = normalise([g.name, ...(g.aliases || [])].join(" "));
        return q.split(" ").every((word) => names.includes(word));
      })
    : [];
}
export type GameFilters = {
  tab: "explore" | "upcoming" | "collection";
  platform: "mine" | "all" | GamePlatform;
  genre: string;
  status: "all" | GameStatus;
};
export function filterGames(
  filters: GameFilters,
  platforms: GamePlatform[],
  collection: GameCollection,
  additional: Game[] = [],
): Game[] {
  const catalogue = [...new Map([...games, ...additional].map(game => [game.id, game])).values()];
  const list = catalogue.filter((g) => {
    const matchesPlatform =
      filters.platform === "all" ||
      (filters.platform === "mine"
        ? platforms.length === 0 || g.platforms.some((p) => platforms.includes(p))
        : g.platforms.includes(filters.platform));
    return (
      matchesPlatform &&
      (filters.tab !== "upcoming" || !g.released) &&
      (filters.tab !== "collection" || !!collection[g.id]) &&
      (filters.status === "all" || collection[g.id] === filters.status) &&
      (filters.genre === "all" || g.genre === filters.genre)
    );
  });
  return filters.tab === "upcoming"
    ? list.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
    : list;
}
