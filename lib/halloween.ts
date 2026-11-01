import type { Title } from "./catalogue";

export const halloweenMoods = [
  { id: "all", label: "All chills" },
  { id: "horror", label: "Horror" },
  { id: "supernatural", label: "Supernatural" },
  { id: "family", label: "Family friendly" },
] as const;
export type HalloweenMood = (typeof halloweenMoods)[number]["id"];
export const isHalloweenMood = (value: unknown): value is HalloweenMood =>
  halloweenMoods.some((mood) => mood.id === value);

// Bump when catalogue or relevance rules change so stale client results expire.
export const halloweenCatalogueVersion = "5";
type HalloweenPick = Pick<Title, "name" | "year" | "kind"> & { tmdbId: number };
const film = (name: string, year: number, tmdbId: number): HalloweenPick => ({
  name, year, kind: "movie", tmdbId,
});
const series = (name: string, year: number, tmdbId: number): HalloweenPick => ({
  name, year, kind: "series", tmdbId,
});
const selections: Record<Exclude<HalloweenMood, "all">, HalloweenPick[]> = {
  horror: [
    film("Halloween", 1978, 948),
    film("Scream", 1996, 4232),
    film("The Conjuring", 2013, 138843),
    film("The Others", 2001, 1933),
    film("The Shining", 1980, 694),
    film("A Quiet Place", 2018, 447332),
    film("The Babadook", 2014, 242224),
    film("The Cabin in the Woods", 2012, 22970),
  ],
  supernatural: [
    series("Wednesday", 2022, 119051),
    series("Stranger Things", 2016, 66732),
    series("The Haunting of Hill House", 2018, 72844),
    film("Ghostbusters", 1984, 620),
    film("Beetlejuice", 1988, 4011),
    series("The Haunting of Bly Manor", 2020, 109958),
    film("Sleepy Hollow", 1999, 2668),
    film("The Others", 2001, 1933),
  ],
  family: [
    film("Hocus Pocus", 1993, 10439),
    film("Coraline", 2009, 14836),
    film("The Nightmare Before Christmas", 1993, 9479),
    film("Hotel Transylvania", 2012, 76492),
    film("ParaNorman", 2012, 77174),
    film("Corpse Bride", 2005, 3933),
    film("Wallace & Gromit: The Curse of the Were-Rabbit", 2005, 533),
    film("The Addams Family", 2019, 481084),
  ],
};

export function halloweenSelections(mood: HalloweenMood): HalloweenPick[] {
  if (mood !== "all") return selections[mood];
  // Include every category, alternating moods and removing overlapping picks.
  const mixed = Array.from({ length: Math.max(...Object.values(selections).map((picks) => picks.length)) }, (_, index) => [
    selections.family[index],
    selections.horror[index],
    selections.supernatural[index],
  ]).flat().filter(Boolean);
  return [...new Map(mixed.map((pick) => [pick.kind + pick.tmdbId, pick])).values()];
}

export function halloweenDiscoveryTopics(mood: HalloweenMood): string[] {
  // Witchcraft and generic supernatural tags also describe ordinary fantasy.
  const spooky = ["ghost", "vampire", "werewolf", "zombie", "haunted house"];
  return mood === "supernatural" ? spooky : ["halloween", ...spooky];
}

const reviewedPicks = new Set(Object.values(selections).flat().map((pick) => pick.kind + pick.tmdbId));

export function isHalloweenRelevant(
  title: Pick<Title, "kind" | "tmdbId" | "name" | "summary" | "genres">,
): boolean {
  if (reviewedPicks.has(title.kind + title.tmdbId) || title.genres.includes("Horror")) return true;
  const story = `${title.name} ${title.summary}`;
  if (/\bhalloween\b/i.test(story)) return true;
  // For unreviewed family films, require a specific spooky subject in the story,
  // rather than accepting magic, witches or monsters as Halloween evidence.
  return title.genres.includes("Family") &&
    /\b(?:haunted (?:house|mansion|castle)|ghosts?|vampires?|werewolf|werewolves|zombies?|poltergeists?)\b/i.test(story);
}
