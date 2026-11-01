import type { Person } from "./people";
import { cleanUpcomingFilters, type UpcomingFilters } from "./upcoming";
import { parseExtraFilters, noExtraFilters, type ExtraFilters } from "./catalogue-filters";
import { services, type Title } from "./catalogue";
export type View = "discover" | "films" | "series" | "upcoming" | "watchlist" | "gaming";
export type TabSnapshot = {
  searchPage?: number;
  searchHasMore?: boolean;
  people?: Person[];
  peopleHasMore?: boolean;
  peopleMessage?: string;
  availability?: string;
  upcoming?: UpcomingFilters;
  extra?: ExtraFilters;
  genre: string;
  offer: string;
  sort: string;
  query: string;
  submitted: string;
  results: Title[];
  searchError: string;
  showFilters: boolean;
  hideWatched: boolean;
  watchlistTab: string;
  scroll: number;
};
export const tabMemoryKey = (userId: string) => "scene.tabs.v2." + userId;
export function readTabs(userId: string): {
  restored: boolean;
  view: View;
  provider: string;
  tabs: Partial<Record<View, TabSnapshot>>;
} {
  try {
    const v = JSON.parse(sessionStorage.getItem(tabMemoryKey(userId)) || "null");
    if (!v || !["discover", "films", "series", "upcoming", "watchlist", "gaming"].includes(v.view))
      throw Error();
    const tabs: Partial<Record<View, TabSnapshot>> = {};
    for (const key of ["discover", "films", "series", "upcoming", "watchlist", "gaming"] as const) {
      const x = v.tabs?.[key];
      if (
        x &&
        ["all", "sub", "free"].includes(x.offer) &&
        ["recommended", "newest", "az", "rating"].includes(x.sort) &&
        typeof x.genre === "string" &&
        typeof x.query === "string" &&
        typeof x.submitted === "string" &&
        Array.isArray(x.results)
      ) {
        tabs[key] = {
          ...x,
          searchPage: Number.isInteger(x.searchPage) && x.searchPage >= 1 && x.searchPage <= 500 ? x.searchPage : 1,
          searchHasMore: x.searchHasMore === true,
          upcoming: cleanUpcomingFilters(x.upcoming),
          extra:
            parseExtraFilters(
              new URLSearchParams(
                Object.entries(x.extra || {})
                  .filter(([, v]) => v !== null)
                  .map(([k, v]) => [k, String(v)]),
              ),
            ) || noExtraFilters(),
          scroll: Math.max(0, Number(x.scroll) || 0),
          hideWatched: x.hideWatched !== false,
          watchlistTab: [
            "saved",
            "watching",
            "calendar",
            "shared",
            "stats",
            "reviews",
            "liked",
            "watched",
            "hidden",
          ].includes(x.watchlistTab)
            ? x.watchlistTab
            : "saved",
        };
      }
    }
    return {
      restored: true, view: v.view, tabs,
      provider: services.some((s) => s.key === v.provider) ? v.provider : "mine",
    };
  } catch {
    return { restored: false, view: "discover", provider: "mine", tabs: {} };
  }
}

export function availableView(view: View, gamingEnabled: boolean): View {
  return view === "gaming" && !gamingEnabled ? "discover" : view;
}
