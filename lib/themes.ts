export const themes = [
  { id: "ocean", name: "Ocean", description: "Deep navy & fresh cyan", background: "#031d2d", accent: "#49dff3" },
  { id: "amethyst", name: "Amethyst", description: "Deep plum & soft lavender", background: "#191321", accent: "#c0a0ee" },
  { id: "forest", name: "Forest", description: "Evergreen & gentle sage", background: "#101f1b", accent: "#a3cfad" },
  { id: "pearl", name: "Pearl", description: "Warm ivory & muted purple", background: "#f7f5f0", accent: "#65409b" },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep blue & mint",
    background: "#101a28",
    accent: "#a5ebc7",
  },
  {
    id: "cinema",
    name: "Cinema",
    description: "Charcoal & warm amber",
    background: "#0c0e11",
    accent: "#f5ae72",
  },
  {
    id: "daylight",
    name: "Daylight",
    description: "Warm white & clear cobalt",
    background: "#faf9f7",
    accent: "#1851ef",
  },
  {
    id: "yellow",
    name: "Yellow",
    description: "Charcoal & bright yellow",
    background: "#171813",
    accent: "#f3dc52",
  },
] as const;
export type ThemeId = (typeof themes)[number]["id"];
export const defaultTheme: ThemeId = "daylight";
export function isTheme(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}
export function resolveTheme(value: unknown): ThemeId {
  return isTheme(value) ? value : defaultTheme;
}
