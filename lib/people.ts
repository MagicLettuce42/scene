import type { Title } from "./catalogue";
export type Person = { id: number; name: string; photo: string | null; department: string };
export type PersonRole = "all" | "acting" | "directing";
export type Filmography = {
  person: Person;
  titles: Title[];
  page: number;
  hasMore: boolean;
  message: string | null;
};
export function personSummary(p: any): Person | null {
  if (!p || p.adult || !Number.isSafeInteger(p.id) || p.id <= 0 || typeof p.name !== "string") return null;
  return {
    id: p.id,
    name: p.name.slice(0, 150),
    department: typeof p.known_for_department === "string" ? p.known_for_department.slice(0, 80) : "",
    photo:
      typeof p.profile_path === "string" && /^\/[a-zA-Z0-9._-]+$/.test(p.profile_path)
        ? "https://image.tmdb.org/t/p/w185" + p.profile_path
        : null,
  };
}
export function creditCandidates(data: any, role: PersonRole) {
  const cast = Array.isArray(data.cast) ? data.cast : [],
    crew = Array.isArray(data.crew) ? data.crew : [];
  const rows = [
      ...(role === "directing" ? [] : cast),
      ...(role === "acting" ? [] : crew.filter((c: any) => c.job === "Director")),
    ],
    seen = new Set<string>();
  return rows
    .filter((r: any) => {
      const key = r.media_type + "-" + r.id;
      if (
        r.adult ||
        !["movie", "tv"].includes(r.media_type) ||
        !Number.isSafeInteger(r.id) ||
        r.id <= 0 ||
        seen.has(key)
      )
        return false;
      seen.add(key);
      return true;
    })
    .sort((a: any, b: any) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0));
}
