import type { Title } from "./catalogue";
export type ExtraFilters = {
  runtimeMax: number | null;
  yearFrom: number | null;
  yearTo: number | null;
  minRating: number | null;
  language: string;
};
export const noExtraFilters = (): ExtraFilters => ({
  runtimeMax: null,
  yearFrom: null,
  yearTo: null,
  minRating: null,
  language: "",
});
export const originalLanguages = [
  ["en", "English"],
  ["fr", "French"],
  ["es", "Spanish"],
  ["de", "German"],
  ["it", "Italian"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["hi", "Hindi"],
  ["zh", "Chinese"],
  ["pt", "Portuguese"],
  ["da", "Danish"],
  ["sv", "Swedish"],
  ["no", "Norwegian"],
] as const;
// Keep UI choices aligned with the API's existing historical/future range.
export const catalogueYearMin = 1870;
export const catalogueYearMax = 2100;
export function catalogueYearGroups(currentYear = new Date().getFullYear()) {
  const pivot = Math.max(catalogueYearMin - 1, Math.min(catalogueYearMax, currentYear));
  return [
    { label: "Current and earlier", years: Array.from({ length: pivot - catalogueYearMin + 1 }, (_, i) => pivot - i) },
    { label: "Future releases", years: Array.from({ length: catalogueYearMax - pivot }, (_, i) => pivot + i + 1) },
  ].filter((group) => group.years.length);
}
export function parseExtraFilters(p: URLSearchParams): ExtraFilters | null {
  const f = noExtraFilters();
  for (const [key, min, max] of [
    ["runtimeMax", 1, 600],
    ["yearFrom", catalogueYearMin, catalogueYearMax],
    ["yearTo", catalogueYearMin, catalogueYearMax],
    ["minRating", 1, 10],
  ] as const) {
    const raw = p.get(key);
    if (raw === null || raw === "") continue;
    if (!/^\d{1,4}$/.test(raw) || Number(raw) < min || Number(raw) > max) return null;
    f[key] = Number(raw);
  }
  f.language = p.get("language") || "";
  if (f.language && !/^[a-z]{2}$/.test(f.language)) return null;
  if (f.yearFrom && f.yearTo && f.yearFrom > f.yearTo) return null;
  return f;
}
export function extraParams(f: ExtraFilters) {
  return Object.fromEntries(
    Object.entries(f)
      .filter(([, v]) => v !== null && v !== "")
      .map(([k, v]) => [k, String(v)]),
  );
}
export function hasExtraFilters(f: ExtraFilters) {
  return Object.keys(extraParams(f)).length > 0;
}
export function matchesExtra(t: Title, f: ExtraFilters) {
  return (
    (!f.runtimeMax || t.kind !== "movie" || (!!t.runtime && t.runtime <= f.runtimeMax)) &&
    (!f.yearFrom || (!!t.year && t.year >= f.yearFrom)) &&
    (!f.yearTo || (!!t.year && t.year <= f.yearTo)) &&
    (!f.minRating || (!!t.rating && t.rating >= f.minRating && (t.voteCount || 0) >= 50)) &&
    (!f.language || t.originalLanguage === f.language)
  );
}
