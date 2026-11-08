import type { View } from "./tab-memory";

export const homeSections = [
  { id: "personal", label: "For you" },
  { id: "arrivals", label: "New on your services" },
  { id: "leaving", label: "Leaving soon" },
  { id: "tonight", label: "Watch tonight" },
  { id: "popular", label: "Popular on your services" },
  { id: "rated", label: "Highly rated films" },
  { id: "recent", label: "Recent releases" },
  { id: "short", label: "100 minutes or less" },
  { id: "calendar", label: "Upcoming episodes" },
] as const;
export type HomeSection = (typeof homeSections)[number]["id"];
export type HomePreferences = {
  startView: View;
  density: "compact" | "comfortable";
  sections: HomeSection[];
  hidden: HomeSection[];
};
export const defaultHome = (): HomePreferences => ({
  startView: "discover",
  density: "compact",
  sections: ["popular", "personal", "arrivals", "leaving", "tonight", "rated", "recent", "short", "calendar"],
  hidden: ["calendar"],
});
const views = ["discover", "films", "series", "upcoming", "watchlist", "gaming"];
const validSections = (v: unknown): v is HomeSection[] =>
  Array.isArray(v) &&
  v.length <= homeSections.length &&
  new Set(v).size === v.length &&
  v.every((id) => homeSections.some((s) => s.id === id));
export function validHomePatch(value: unknown): value is Partial<HomePreferences> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>,
    keys = Object.keys(v);
  return (
    keys.length > 0 &&
    keys.every((k) =>
      k === "startView"
        ? views.includes(v[k] as string)
        : k === "density"
          ? ["compact", "comfortable"].includes(v[k] as string)
          : k === "sections"
            ? validSections(v[k]) && v[k].length === homeSections.length
            : k === "hidden"
              ? validSections(v[k])
              : false,
    )
  );
}
export function migrateHomePatch(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const migrated = { ...value } as Record<string, unknown>;
  for (const key of ["sections", "hidden"]) {
    if (Array.isArray(migrated[key])) migrated[key] = migrated[key].filter(id => id !== "halloween" && id !== "next");
  }
  return migrated;
}
export function resolveHome(value?: Partial<HomePreferences>): HomePreferences {
  const d = defaultHome();
  if (!value) return d;
  // Retire old Discover shelves while keeping account order and visibility choices.
  value = migrateHomePatch(value) as Partial<HomePreferences>;
  for (const k of Object.keys(d) as (keyof HomePreferences)[])
    if (validHomePatch({ [k]: value[k] })) Object.assign(d, { [k]: value[k] });
  // Add new sections without discarding an existing customised order.
  if (validSections(value.sections)) {
    const added = d.sections.filter((id) => !value.sections!.includes(id));
    d.sections = [
      ...value.sections,
      ...added,
    ];
  }
  return d;
}
