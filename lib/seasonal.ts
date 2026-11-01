import { resolveTheme, type ThemeId } from "./themes";

// This campaign is retired permanently, including future Octobers.
export function halloweenActive(_now = new Date()) {
  return false;
}

export function effectiveTheme(theme: ThemeId, _seasonal = true, _now = new Date()): ThemeId {
  // Older saved Halloween preferences safely fall back to Ocean.
  return resolveTheme(theme);
}
