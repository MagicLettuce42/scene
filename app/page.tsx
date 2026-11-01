"use client";
import MotionDrawer from "./components/motion-drawer";
import SceneMotion from "./components/scene-motion";
import WatchlistToolbar from "./components/watchlist-toolbar";
import SelectControl from "./components/select-control";
import { AppUpdateNotice } from "./components/app-updates";
import {DiscoverVariety} from "./components/discover-variety";
import SearchSuggestions from "./components/search-suggestions";
import PersonalCollections from "./components/personal-collections";
import {titleKey} from "../lib/library-state";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import SectionBoundary from "./components/section-boundary";
import FilterPresets from "./components/filter-presets";
import type { FilterPreset } from "../lib/filter-presets";
import { FeedbackForm, FeedbackInbox } from "./components/product-feedback";
import QualityMonitor from "./components/quality-monitor";
import TasteSetup from "./components/taste-setup";
const TasteProfile = lazy(() => import("./components/taste-profile"));
const Gaming = lazy(() => import("./components/gaming"));
import type { Game, GameStatus } from "../lib/gaming";
import Discover from "./components/discover";
import { useHalloween } from "./components/seasonal";
import { effectiveTheme } from "../lib/seasonal";
import { useMobileViewport } from "../lib/use-mobile-viewport";
import ServiceActivity from "./components/service-activity";
import ForYou from "./components/for-you";
const Upcoming = lazy(() => import("./components/upcoming"));
import ReleaseBadge from "./components/release-badge";
import WatchlistTools from "./components/watchlist-tools";
import {
  watchlistAvailability,
  availabilityLabels,
  cleanAvailabilityFilter,
  type AvailabilityFilter,
} from "../lib/watchlist-availability";
import { RemindersProvider, ReminderButton } from "./components/release-reminders";
import { defaultUpcoming, cleanUpcomingFilters, type UpcomingFilters } from "../lib/upcoming";
import EpisodeCalendar from "./components/episode-calendar";
import PersonalReview from "./components/personal-review";
import ExtraFilterFields from "./components/extra-filters";
import { loadBrowseBatches, mergeBrowseTitles } from "../lib/browse-loading";
import {
  noExtraFilters,
  extraParams,
  matchesExtra,
  hasExtraFilters,
  type ExtraFilters,
} from "../lib/catalogue-filters";
import Tonight from "./components/tonight";
import SceneAccess, { useAccount } from "./components/scene-access";
const ReleaseManager = lazy(() => import("./components/release-manager"));
import SearchResults from "./components/search-results";
const PeopleExplorer = lazy(() => import("./components/people-explorer"));
const PeopleFollowing = lazy(() => import("./components/people-following"));
import ViewingStats from "./components/viewing-stats";
import type { Person } from "../lib/people";
const AccountPanel = lazy(() => import("./components/account-panel"));
import Welcome from "./components/welcome";
import ProfileAvatar from "./components/profile-avatar";
const SharedWatchlists = lazy(() => import("./components/shared-watchlists"));
import ShareTitle from "./components/share-title";
import SpoilerContent, { SpoilerSettings } from "./components/spoiler-content";
import SeriesGuide from "./components/series-guide";
import SceneWordmark from "./components/scene-wordmark";
import EpisodeTracker from "./components/episode-tracker";
import NextUp from "./components/next-up";
import SyncStatus from "./components/sync-status";
import { useLibrarySync } from "../lib/use-library-sync";
import { defaultTheme } from "../lib/themes";
import { sceneFetch } from "../lib/auth/client";
import { sessionBoundary } from "../lib/auth/session-boundary";
import WatchOptions from "./components/watch-options";
import ServiceScope from "./components/service-scope";
import { mergeViewingOffers } from "../lib/viewing-options";
import TitleExtrasPanel from "./components/title-extras";
import { Poster, ServiceMark, myOffers, TitleCard, FeedbackButtons } from "./components/catalogue-cards";
import { cachedJSON, readCache, writeCache } from "../lib/client-cache";
import { findFeedback, visibleSuggestions, type Feedback, type FeedbackAction } from "../lib/preferences";
import { availableView, readTabs, tabMemoryKey, type View, type TabSnapshot } from "../lib/tab-memory";
import {
  Gamepad2,
  Search,
  Bookmark,
  Plus,
  Check,
  X,
  ArrowUpRight,
  ArrowRight,
  SlidersHorizontal,
  Film,
  Clapperboard,
  Compass,
  MonitorPlay,
  Tv,
  Globe2,
  Info,
  RotateCcw,
  Shuffle,
  LoaderCircle,
  CalendarDays,
} from "lucide-react";
import {
  titles,
  services,
  availabilityUrl,
  filterTitles,
  safeUrl,
  sameTitle,
  type Title,
  type Offer,
} from "../lib/catalogue";
function titleEndpoint(t: Title, direct = false) {
  const id = t.id.startsWith("arrival-")
    ? t.id
    : t.tmdbId
      ? `tmdb-${t.kind === "movie" ? "movie" : "tv"}-${t.tmdbId}`
      : t.id;
  const p = new URLSearchParams();
  if (/^(wm|tv)-/.test(id)) {
    p.set("name", t.name);
    p.set("kind", t.kind);
    if (t.year) p.set("year", String(t.year));
    if (t.imdbId) p.set("imdb", t.imdbId);
  }
  if (
    t.kind === "movie" &&
    t.upcomingRelease &&
    (t.upcomingRelease.kind === "cinema" || t.upcomingRelease.kind === "digital")
  )
    p.set("releaseFormat", t.upcomingRelease.kind);
  if (direct) p.set("direct", "1");
  return `/api/title/${encodeURIComponent(id)}?${p}`;
}
type BrowsePage = {
  key: string;
  titles: Title[];
  page: number;
  hasMore: boolean;
  capped: boolean;
  genres: string[];
  message: string | null;
};
export default function Home() {
  return (
    <SceneAccess>
      <RemindersProvider>
        <Catalogue />
      </RemindersProvider>
    </SceneAccess>
  );
}
function Catalogue() {
  useMobileViewport();
  const account = useAccount(),
    tabsStorageKey = tabMemoryKey(account.id);
  const [activeCollection,setActiveCollection]=useState("");
  const [searchFocused,setSearchFocused]=useState(false);
  const searchRegion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!searchFocused) return;
    // iOS may blur a search field with no relatedTarget before delivering the
    // row's click. Dismiss only on an interaction outside the whole region.
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !searchRegion.current?.contains(event.target)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("focusin", dismissOutside, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("focusin", dismissOutside, true);
    };
  }, [searchFocused]);
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [upcomingFilters, setUpcomingFilters] = useState<UpcomingFilters>(defaultUpcoming);
  const [setup, setSetup] = useState(false),
    [sharedToken, setSharedToken] = useState("");
  const [requestedView, setView] = useState<View>("discover"),
    [query, setQuery] = useState(""),
    [submitted, setSubmitted] = useState("");
  const [searchPage, setSearchPage] = useState(1), [searchHasMore, setSearchHasMore] = useState(false),
    [searchMoreBusy, setSearchMoreBusy] = useState(false), [searchMoreError, setSearchMoreError] = useState("");
  const [searchPeople, setSearchPeople] = useState<Person[]>([]),
    [searchPeopleHasMore, setSearchPeopleHasMore] = useState(false),
    [searchPeopleMessage, setSearchPeopleMessage] = useState("");
  const [results, setResults] = useState<Title[]>(titles),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState("");
  const library = useLibrarySync(account);
  const halloween = useHalloween();
  const { saved, selected, feedback, ready } = library;
  const [provider, setProvider] = useState("mine");
  const activeProvider = selected.includes(provider) ? provider : "mine";
  const activeServices = useMemo(
    () => activeProvider === "mine" ? selected : [activeProvider],
    [activeProvider, selected],
  );
  const serviceName = services.find((s) => s.key === activeProvider)?.name;
  const serviceScope = serviceName || "your services";
  useEffect(() => {
    if (library.loaded && provider !== "mine" && !selected.includes(provider)) setProvider("mine");
  }, [library.loaded, provider, selected]);
  const inSetup = ready && library.loaded && (!library.onboarded || setup);
  const view = availableView(requestedView, library.gamingEnabled);
  useEffect(() => {
    if (library.loaded && requestedView === "gaming" && !library.gamingEnabled) {
      setView("discover");
      viewRef.current = "discover";
      setSubmitted("");
      setQuery("");
    }
  }, [library.loaded, requestedView, library.gamingEnabled]);
  useEffect(() => {
    if (!inSetup) document.documentElement.dataset.theme = effectiveTheme(library.theme, library.seasonal);
  }, [library.theme, library.seasonal, halloween, inSetup]);
  useEffect(
    () => () => {
      document.documentElement.dataset.theme = effectiveTheme(defaultTheme);
    },
    [],
  );
  const [genre, setGenre] = useState("all"),
    [sort, setSort] = useState("recommended"),
    [extra, setExtra] = useState<ExtraFilters>(noExtraFilters);
  const offer = "all";
  const [showFilters, setShowFilters] = useState(false),
    [detail, setDetail] = useState<Title | null>(null),
    [detailBusy, setDetailBusy] = useState(false),
    [detailError, setDetailError] = useState("");
  const [dialog, setDialog] = useState<
      "services" | "about" | "title" | "account" | "releases" | "people" | "feedback" | null
    >(null),
    [toast, setToastText] = useState(""),
    [toastWarning, setToastWarning] = useState(false),
    [live, setLive] = useState(false),
    [feed, setFeed] = useState("tvmaze"),
    [canLoadDirect, setCanLoadDirect] = useState(false);
  function setToast(message: string, warning = false) {
    setToastText(message);
    setToastWarning(warning);
  }
  const [accountSection, setAccountSection] = useState<string | null>(null);
  const [person, setPerson] = useState<Person | null>(null),
    [peopleQuery, setPeopleQuery] = useState("");
  const [peopleView,setPeopleView]=useState<"search"|"following">("search");
  function openPerson(value: Person | null, initialQuery = "", initialView: "search"|"following" = "search") {
    setPeopleView(initialView);
    setPeopleQuery(initialQuery);
    setPerson(value);
    setDialog("people");
  }
  const [directOffers, setDirectOffers] = useState<Offer[] | null>(null),
    [directBusy, setDirectBusy] = useState(false),
    [directMessage, setDirectMessage] = useState("");
  const [browse, setBrowse] = useState<BrowsePage>({
      key: "",
      titles: [],
      page: 0,
      hasMore: false,
      capped: false,
      genres: [],
      message: null,
    }),
    [browseBusy, setBrowseBusy] = useState(false),
    [browseError, setBrowseError] = useState(""),
    [browseRetryPage, setBrowseRetryPage] = useState(1);
  const [undoFeedback, setUndoFeedback] = useState<{
      title: Title;
      previous: Feedback | undefined;
      action: FeedbackAction;
    } | null>(null),
    [hideWatched, setHideWatched] = useState(true),
    [watchlistTab, setWatchlistTab] = useState("saved"),
    [discoverGenres, setDiscoverGenres] = useState<string[]>([]);
  const mergeDiscoverGenres = useCallback(
    (genres: string[]) =>
      setDiscoverGenres((previous) => {
        const merged = [...new Set([...previous, ...genres])].sort();
        return merged.join("|") === previous.join("|") ? previous : merged;
      }),
    [],
  );
  const tabMemory = useRef<Partial<Record<View, TabSnapshot>>>({}),
    restoreScroll = useRef<number | null>(null),
    viewRef = useRef<View>("discover");
  const startApplied = useRef(false),
    userNavigated = useRef(false);
  const browseAbort = useRef<AbortController | null>(null);
  const modal = useRef<HTMLDialogElement>(null),
    searchInput = useRef<HTMLInputElement>(null),
    searchAbort = useRef<AbortController | null>(null),
    detailRequest = useRef(0),
    resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const memory = readTabs(account.id);
    tabMemory.current = memory.tabs;
    startApplied.current = memory.restored;
    const remembered = memory.tabs[memory.view];
    setProvider(memory.provider);
    setView(memory.view);
    viewRef.current = memory.view;
    if (remembered) restoreTab(remembered);
    sceneFetch("/api/status")
      .then((r) => r.json())
      .then((v) => {
        const status = v as { live: boolean; source: string; directLinks: boolean };
        setLive(status.live === true);
        setFeed(status.source);
        setCanLoadDirect(status.directLinks === true);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!library.loaded || startApplied.current) return;
    startApplied.current = true;
    if (!userNavigated.current) {
      const initialView = availableView(library.home.startView, library.gamingEnabled);
      setView(initialView);
      viewRef.current = initialView;
    }
  }, [library.loaded, library.home.startView, library.gamingEnabled]);
  useEffect(() => {
    if (
      new URLSearchParams(location.search).get("scene") === "reminders" ||
      new URLSearchParams(location.search).get("scene") === "availability"
    ) {
      setAccountSection(
        new URLSearchParams(location.search).get("scene") === "availability"
          ? "availability-alerts"
          : "release-reminders",
      );
      setDialog("account");
      history.replaceState(null, "", location.pathname + location.hash);
    }
    const acceptLink = () => {
      const token = new URLSearchParams(location.hash.slice(1)).get("shared");
      if (token) {
        userNavigated.current = true;
        startApplied.current = true;
        setSharedToken(token);
        setView("watchlist");
        viewRef.current = "watchlist";
        setWatchlistTab("shared");
        setQuery("");
        setSubmitted("");
        history.replaceState(null, "", location.pathname + location.search);
      }
    };
    acceptLink();
    window.addEventListener("hashchange", acceptLink);
    return () => window.removeEventListener("hashchange", acceptLink);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const el = modal.current;
    if (!el) return;
    if (dialog && !el.open) el.showModal();
    if (!dialog && el.open) el.close();
    if (!dialog) return;
    const top = window.scrollY;
    const body = document.body;
    body.style.position = "fixed";
    body.style.top = `-${top}px`;
    body.style.width = "100%";
    return () => {
      body.style.position = "";
      body.style.top = "";
      body.style.width = "";
      window.scrollTo({ top, behavior: "instant" });
    };
  }, [dialog]);
  useEffect(() => {
    if (!dialog) return;
    modal.current?.scrollTo({ top: 0, behavior: "instant" });
    const heading = modal.current?.querySelector<HTMLElement>("#dialog-title");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }, [dialog, person?.id]);
  useEffect(
    () => () => {
      searchAbort.current?.abort();
      browseAbort.current?.abort();
    },
    [],
  );
  const needsServices = ready && !selected.length;
  const browsing = (view === "films" || view === "series") && !submitted;
  const browseKey =
    browsing && ready && selected.length
      ? new URLSearchParams({
          kind: view === "films" ? "movie" : "tv",
          genre,
          offer,
          sort,
          ...extraParams(extra),
          mine: "1",
          services: [...activeServices].sort().join(","),
        }).toString()
      : "";
  async function loadBrowse(page = 1, append = false, key = browseKey, force = false) {
    if (!key) return;
    browseAbort.current?.abort();
    const controller = new AbortController();
    browseAbort.current = controller;
    setBrowseBusy(true);
    setBrowseError("");
    setBrowseRetryPage(page);
    if (!append)
      setBrowse((previous) => ({
        ...previous,
        key,
        titles: [],
        page: 0,
        hasMore: false,
        capped: false,
        message: null,
      }));
    try {
      await loadBrowseBatches({
        page,
        append,
        key,
        signal: controller.signal,
        force,
        request: cachedJSON,
        onAttempt: setBrowseRetryPage,
        onPage: (data, shouldAppend) => {
          setBrowse((previous) => {
            const merged = {
              ...data,
              key,
              titles: mergeBrowseTitles(
                shouldAppend && previous.key === key ? previous.titles : [],
                data.titles,
              ),
            };
            writeCache("browse:" + key, merged);
            return merged;
          });
        },
      });
    } catch (e) {
      if (!controller.signal.aborted)
        setBrowseError((e as Error).message || "The catalogue could not load. Please try again.");
    } finally {
      if (!controller.signal.aborted) setBrowseBusy(false);
    }
  }

  useEffect(() => {
    if (browseKey) {
      const cached = readCache<BrowsePage>("browse:" + browseKey);
      if (cached) {
        setBrowse(cached);
        setBrowseBusy(false);
        setBrowseError("");
        if (cached.page === 1 && cached.hasMore) void loadBrowse(2, true, browseKey);
      } else void loadBrowse(1, false, browseKey);
    } else {
      browseAbort.current?.abort();
      setBrowseBusy(false);
    }
    return () => browseAbort.current?.abort();
  }, [browseKey]);
  const isSaved = (t: Title) => saved.some((s) => sameTitle(s, t));
  function toggleSave(t: Title) {
    setUndoFeedback(null);
    library.clearUndo();
    const exists = isSaved(t);
    if (!exists && saved.length >= 300) {
      setToast("Your watchlist is full. Remove a title to add another.", true);
      return;
    }
    library.save(t, !exists);
    // Removing is one tap on a small bookmark, so it can be undone like watched/liked/hidden.
    setToast(exists ? `${t.name} removed from your watchlist` : `${t.name} added to your watchlist`);
  }
  function onEpisodes(title: Title, season: number, episodes: number[], value: boolean) {
    setUndoFeedback(null);
    library.episode(title, season, episodes, value);
    setToast(value ? "Episodes marked watched" : "Episodes marked unwatched");
  }
  useEffect(() => {
    if (library.undoNotice) setToast(library.undoNotice);
  }, [library.undoNotice]);
  function resetFilters(resetService = true) {
    if (resetService) setProvider("mine");
    setAvailability("all");
    restoreScroll.current = null;
    setGenre("all");
    setSort("recommended");
    setHideWatched(true);
    setExtra(noExtraFilters());
  }
  function clearFilters() {
    resetFilters();
  }
  function restoreTab(t: TabSnapshot) {
    setSearchPage(t.searchPage || 1); setSearchHasMore(t.searchHasMore === true); setSearchMoreBusy(false); setSearchMoreError("");
    setSearchPeople(t.people || []);
    setSearchPeopleHasMore(t.peopleHasMore === true);
    setSearchPeopleMessage(t.peopleMessage || "");
    setAvailability(cleanAvailabilityFilter(t.availability));
    setUpcomingFilters(cleanUpcomingFilters(t.upcoming));
    setGenre(t.genre);
    setExtra(t.extra || noExtraFilters());
    setSort(t.sort);
    setQuery(t.query);
    setSubmitted(t.submitted);
    setResults(t.results);
    setSearchError(t.searchError || "");
    setShowFilters(Boolean(t.showFilters));
    setHideWatched(t.hideWatched);
    setWatchlistTab(t.watchlistTab);
    restoreScroll.current = t.scroll;
  }
  function snapshot(): TabSnapshot {
    return {
      searchPage, searchHasMore,
      people: searching ? [] : searchPeople,
      peopleHasMore: searchPeopleHasMore,
      peopleMessage: searchPeopleMessage,
      availability,
      upcoming: upcomingFilters,
      extra,
      genre,
      offer,
      sort,
      query,
      submitted: searching ? "" : submitted,
      results,
      searchError,
      showFilters,
      hideWatched,
      watchlistTab,
      scroll:
        document.body.style.position === "fixed"
          ? Math.abs(parseFloat(document.body.style.top) || 0)
          : window.scrollY,
    };
  }
  function rememberTab() {
    if (sessionBoundary().userId !== account.id || !ready || !startApplied.current) return;
    tabMemory.current[view] = snapshot();
    try {
      sessionStorage.setItem(
        tabsStorageKey,
        JSON.stringify({ view: viewRef.current, provider: activeProvider, tabs: tabMemory.current }),
      );
    } catch {}
  }
  function navigate(next: View) {
    if (sessionBoundary().userId !== account.id || (next === "gaming" && !library.gamingEnabled)) return;
    userNavigated.current = true;
    startApplied.current = true;
    rememberTab();
    searchAbort.current?.abort();
    setSearching(false); setSearchMoreBusy(false); setSearchMoreError("");
    setView(next);
    viewRef.current = next;
    const previous = tabMemory.current[next];
    if (previous) restoreTab(previous);
    else {
      setSearchPeople([]);
      setSearchPeopleHasMore(false);
      setSearchPeopleMessage("");
      setUpcomingFilters(defaultUpcoming());
      setSubmitted("");
      setQuery("");
      setResults(titles);
      setSearchPage(1); setSearchHasMore(false);
      setSearchError("");
      setShowFilters(false);
      setWatchlistTab("saved");
      resetFilters(false);
      restoreScroll.current = 0;
    }
    try {
      sessionStorage.setItem(tabsStorageKey, JSON.stringify({ view: next, provider: activeProvider, tabs: tabMemory.current }));
    } catch {}
  }
  function onFeedback(t: Title, action: FeedbackAction) {
    const previous = findFeedback(feedback, t);
    library.clearUndo();
    setUndoFeedback({ title: t, previous, action });
    const value = !previous?.[action];
    library.activity(t, {
      [action]: value,
      ...(action === "liked" && value ? { hidden: false } : {}),
      ...(action === "hidden" && value ? { liked: false } : {}),
    });
    setToast(
      previous?.[action]
        ? `${t.name}: ${action === "hidden" ? "restored" : "mark removed"}`
        : `${t.name}: ${action === "hidden" ? "hidden" : action === "liked" ? "liked" : "watched"}`,
    );
  }
  function undoLastFeedback() {
    if (library.canUndo) {
      setToast(library.undoLastChange() ? "Undo queued · syncing with your account" : "Undo is no longer available");
      return;
    }
    if (!undoFeedback) return;
    const { title, previous, action } = undoFeedback;
    library.activity(title, {
      [action]: Boolean(previous?.[action]),
      ...(action === "liked" ? { hidden: Boolean(previous?.hidden) } : {}),
      ...(action === "hidden" ? { liked: Boolean(previous?.liked) } : {}),
    });
    setUndoFeedback(null);
    setToast("Change undone");
  }
  useEffect(() => {
    if (!ready) return;
    rememberTab();
    const save = () => {
      if (!document.body.style.position) rememberTab();
    };
    window.addEventListener("pagehide", save);
    let timer: ReturnType<typeof setTimeout>;
    const scroll = () => {
      clearTimeout(timer);
      timer = setTimeout(save, 200);
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("pagehide", save);
      window.removeEventListener("scroll", scroll);
      clearTimeout(timer);
    };
  }, [
    view,
    ready,
    genre,
    offer,
    sort,
    extra,
    query,
    submitted,
    results,
    showFilters,
    hideWatched,
    watchlistTab,
    upcomingFilters,
    availability,
    activeProvider,
    searchPage, searchHasMore,
    searchPeople,
    searchPeopleHasMore,
    searchPeopleMessage,
  ]);
  useEffect(() => {
    if (!ready || restoreScroll.current === null) return;
    const restore = () => {
      const target = restoreScroll.current;
      if (target === null) return;
      window.scrollTo({ top: target, behavior: "instant" });
      if (document.documentElement.scrollHeight - window.innerHeight >= target) restoreScroll.current = null;
    };
    const frame = requestAnimationFrame(restore),
      observer = new ResizeObserver(restore);
    observer.observe(document.body);
    const cancel = () => {
      restoreScroll.current = null;
    };
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("keydown", cancel);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("keydown", cancel);
    };
  }, [view, ready, browse, results]);

  async function search(e?: React.FormEvent, searchText = query) {
    e?.preventDefault();
    userNavigated.current = true;
    startApplied.current = true;
    searchInput.current?.blur();
    setSearchFocused(false);
    const q = searchText.trim();
    if(q.length>=2)try{const key='scene.recent-searches.'+account.id;const old=JSON.parse(sessionStorage.getItem(key)||'[]');sessionStorage.setItem(key,JSON.stringify([q,...(Array.isArray(old)?old:[]).filter((x:unknown)=>typeof x==='string'&&x.toLowerCase()!==q.toLowerCase())].slice(0,6)));}catch{}

    if (q.length < 2) {
      searchInput.current?.focus();
      return;
    }
    browseAbort.current?.abort();
    searchAbort.current?.abort();
    const controller = new AbortController();
    searchAbort.current = controller;
    setSearching(true);
    setSearchPage(1); setSearchHasMore(false); setSearchMoreBusy(false); setSearchMoreError("");
    setSearchError("");
    setSearchPeople([]);
    setSearchPeopleHasMore(false);
    setSearchPeopleMessage("");
    setGenre("all");
    setSubmitted(q);
    restoreScroll.current = null;
    try {
      const data = await cachedJSON<{
        titles: Title[]; page?: number; hasMore?: boolean;
        people?: Person[];
        peopleHasMore?: boolean;
        peopleMessage?: string;
        message?: string;
      }>(`/api/search?q=${encodeURIComponent(q)}&scope=all&page=1`, controller.signal);
      if (controller.signal.aborted) return;
      setResults(data.titles);
      setSearchPage(data.page || 1); setSearchHasMore(data.hasMore === true);
      setSearchPeople(data.people || []);
      setSearchPeopleHasMore(data.peopleHasMore === true);
      setSearchPeopleMessage(data.peopleMessage || "");
      setSearchError(data.message || "");
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setSearchError(
          "Search could not connect. Showing matching saved picks. Try again or check JustWatch UK.",
        );
        setResults(titles.filter((t) => t.name.toLowerCase().includes(q.toLowerCase())));
      }
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
        resultHeading.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }
  async function loadMoreSearch() {
    if (searchMoreBusy || searching || !submitted || !searchHasMore) return;
    searchAbort.current?.abort(); const controller = new AbortController(); searchAbort.current = controller;
    setSearchMoreBusy(true); setSearchMoreError("");
    try {
      const data = await cachedJSON<{ titles: Title[]; page: number; hasMore: boolean; message?: string }>(
        `/api/search?q=${encodeURIComponent(submitted)}&page=${searchPage + 1}`, controller.signal, Boolean(searchMoreError));
      if (controller.signal.aborted) return;
      setResults(old => mergeBrowseTitles(old, data.titles)); setSearchPage(data.page); setSearchHasMore(data.hasMore === true);
      if (data.message) setSearchError(data.message);
    } catch (e) { if (!controller.signal.aborted) setSearchMoreError((e as Error).message || "More titles could not load. Try again."); }
    finally { if (!controller.signal.aborted) setSearchMoreBusy(false); }
  }
  function clearSearch() {
    setSearchPage(1); setSearchHasMore(false); setSearchMoreBusy(false); setSearchMoreError("");
    setSearchPeople([]);
    setSearchPeopleHasMore(false);
    setSearchPeopleMessage("");
    searchAbort.current?.abort();
    setQuery("");
    setSubmitted("");
    setResults(titles);
    setSearching(false);
    setSearchError("");
  }
  async function openTitle(t: Title) {
    setDirectOffers(null);
    setDirectBusy(false);
    setDirectMessage("");
    setDetail(t);
    setDetailError("");
    setDialog("title");
    if (modal.current) modal.current.scrollTop = 0;
    setDetailBusy(true);
    const seq = ++detailRequest.current;
    try {
      const v = await cachedJSON<{ title: Title }>(titleEndpoint(t));
      if (seq === detailRequest.current) {
        v.title = { ...v.title, id: t.id };
        setDetail(v.title);
        library.refreshTitles([v.title]);
        setResults((items) => items.map((x) => (x.id === t.id ? v.title : x)));
        setBrowse((previous) => ({
          ...previous,
          titles: previous.titles.map((x) => (x.id === t.id ? v.title : x)),
        }));
      }
    } catch {
      if (seq === detailRequest.current)
        setDetailError("Could not refresh this title. The saved details are shown below.");
    } finally {
      if (seq === detailRequest.current) setDetailBusy(false);
    }
  }
  async function loadDirectLinks() {
    if (!detail || directBusy) return;
    const seq = detailRequest.current;
    setDirectBusy(true);
    setDirectMessage("");
    try {
      const r = await sceneFetch(titleEndpoint(detail, true));
      const data = (await r.json()) as { offers: Offer[]; error?: string };
      if (seq !== detailRequest.current) return;
      if (!r.ok) throw Error(data.error);
      if (myOffers(data.offers, activeServices).length) setDirectOffers(data.offers);
      else
        setDirectMessage(
          "No direct links for your services were returned. Use the standard watch options below.",
        );
    } catch (e) {
      if (seq === detailRequest.current)
        setDirectMessage(
          (e as Error).message ||
            "Direct links could not be loaded. Standard watch options are still available.",
        );
    } finally {
      if (seq === detailRequest.current) setDirectBusy(false);
    }
  }
  const detailOffers = mergeViewingOffers(detail?.offers || [], directOffers || []);
  const checkedDate = detail?.checked
      ? new Date(detail.checked).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";
  const kind = !submitted && view === "films" ? "movie" : !submitted && view === "series" ? "series" : "all",
    base =
      view === "watchlist" && !submitted
        ? watchlistTab === "saved"
          ? saved.filter(t => !activeCollection || !library.collections.some(c=>c.id===activeCollection) || library.collections.find(c=>c.id===activeCollection)?.members[titleKey(t)])
          : watchlistTab === "reviews"
            ? library.reviews.map((r) => r.title)
            : feedback
                .filter((f) =>
                  watchlistTab === "liked" ? f.liked : watchlistTab === "watched" ? f.watched : f.hidden,
                )
                .map((f) => f.title)
        : browsing
          ? browse.key === browseKey
            ? browse.titles
            : []
          : results;
  const genres = useMemo(
    () =>
      view === "discover" && !submitted
        ? discoverGenres
        : browsing
          ? browse.genres
          : Array.from(new Set(base.flatMap((t) => t.genres))).sort(),
    [base, browsing, browse.genres, view, submitted, discoverGenres],
  );
  const filtered = useMemo(() => {
    const scoped =
      view === "watchlist" && !submitted
        ? base.filter(
            (t) =>
              (genre === "all" || t.genres.includes(genre)) &&
              (activeProvider === "mine" || myOffers(t.offers, activeServices).length > 0) &&
              (watchlistTab !== "saved" ||
                availability === "all" ||
                watchlistAvailability(t, activeServices) === availability),
          )
        : filterTitles(base, { kind, genre, offer: submitted ? "all" : offer, provider: "all", mine: !submitted, selected: activeServices });
    const a = (
      view === "watchlist" && !submitted ? scoped : visibleSuggestions(scoped, feedback, hideWatched)
    ).filter((t) => matchesExtra(t, extra));
    return browsing
      ? a
      : sort === "rating"
        ? a.sort((a, b) => (b.rating || 0) - (a.rating || 0))
        : sort === "az"
          ? a.sort((a, b) => a.name.localeCompare(b.name))
          : sort === "newest"
            ? a.sort((a, b) => (b.year || 0) - (a.year || 0))
            : a;
  }, [
    base,
    kind,
    genre,
    offer,
    activeServices,
    activeProvider,
    sort,
    browsing,
    view,
    submitted,
    feedback,
    hideWatched,
    extra,
    availability,
    watchlistTab,
  ]);
  const catalogueLoading =
    !ready ||
    searching ||
    (browsing && selected.length > 0 && (browse.key !== browseKey || (browseBusy && browse.page === 0)));
  const upcoming = view === "upcoming" && !submitted,
    gaming = view === "gaming" && !submitted;
  const [gameResults, setGameResults] = useState<Game[]>([]);
  useEffect(() => {
    let active = true;
    setGameResults([]);
    if (library.gamingEnabled && submitted.length >= 2)
      void import("../lib/gaming").then(({ searchGames }) => { if (active) setGameResults(searchGames(submitted, true)); }).catch(() => { if (active) setGameResults([]); });
    return () => { active = false; };
  }, [submitted, library.gamingEnabled]);
  function setGameStatus(id: string, status: GameStatus | null) {
    library.setGameStatus(id, status);
    setToast(
      status === "later"
        ? "Added to Play later"
        : status === "playing"
          ? "Marked as Playing"
          : status === "finished"
            ? "Marked as Finished"
            : "Removed from My games",
    );
  }
  const discovering = view === "discover" && !submitted,
    hasFilters = (view === "watchlist" && availability !== "all") || activeProvider !== "mine" || genre !== "all" || sort !== "recommended" || !hideWatched || hasExtraFilters(extra);
  const filterDescription = [
    view !== "watchlist" || activeProvider !== "mine" ? `Services: ${serviceScope}` : null,
    genre !== "all" ? `Genre: ${genre}` : null,
    view === "watchlist" && availability !== "all" ? `Availability: ${availabilityLabels[availability]}` : null,
    extra.runtimeMax ? `Up to ${extra.runtimeMax} minutes` : null,
    extra.yearFrom ? `From ${extra.yearFrom}` : null,
    extra.yearTo ? `Through ${extra.yearTo}` : null,
    extra.minRating ? `Rating ${extra.minRating}+` : null,
    extra.language ? `Language: ${extra.language}` : null,
    view !== "watchlist" && hideWatched ? "Watched titles hidden" : null,
  ].filter(Boolean).join(" · ");
  function changeFilters() {
    setShowFilters(true);
    requestAnimationFrame(() => (document.querySelector("#catalogue-filters select") as unknown as HTMLSelectElement | null)?.focus());
  }
  const [showMoreDiscover, setShowMoreDiscover] = useState(false);
  const visibleHomeSections = library.home.sections.filter(
    (id) => !library.home.hidden.includes(id),
  );
  const displayedHomeSections = showMoreDiscover ? visibleHomeSections : visibleHomeSections.slice(0, 4);
  const halloweenHome = false;
  const specialLibrary =
    view === "watchlist" && !submitted && ["shared", "watching", "calendar", "stats"].includes(watchlistTab);
  const serviceFilterEnabled = !gaming && !(specialLibrary && ["shared", "stats"].includes(watchlistTab));
  const serviceFilter = (
    <label htmlFor="service-filter">
      Service
      <SelectControl
        id="service-filter"
        value={activeProvider}
        disabled={!ready || !selected.length}
        onChange={(e) => {
          restoreScroll.current = null;
          setProvider(e.target.value);
        }}
      >
        <option value="mine">My services</option>
        {services.filter((s) => selected.includes(s.key)).map((s) => (
          <option key={s.key} value={s.key}>{s.name}</option>
        ))}
      </SelectControl>
    </label>
  );
  const heading = submitted
    ? `Results for “${submitted}”`
    : view === "watchlist"
      ? "Your watchlist"
      : view === "films"
        ? `Films on ${serviceScope}`
        : view === "series"
          ? `Series on ${serviceScope}`
          : view === "upcoming"
            ? "Upcoming releases"
            : view === "gaming"
              ? "Your next game"
              : "Discover your next watch";

  const cardActions = {
    watchlist: view === "watchlist" && !submitted,
    selected: activeServices,
    offer: view === "watchlist" && !submitted ? "all" : offer,
    feedback,
    isSaved,
    onSave: toggleSave,
    onOpen: openTitle,
    onFeedback,
  };
  const scopedTracking = activeProvider === "mine"
    ? library.tracking
    : library.tracking.filter((item) => myOffers(item.title.offers, activeServices).length > 0);
  const excluded = [
    ...saved,
    ...feedback.filter((f) => f.watched || f.hidden || f.liked).map((f) => f.title),
    ...library.reviews.filter((r) => r.rating).map((r) => r.title),
    ...library.tracking.map((t) => t.title),
  ];
  const recommendationSignature = JSON.stringify([
    feedback.map((f) => [f.title.id, f.liked, f.hidden, f.watched]),
    library.reviews.map((r) => [r.title.id, r.rating]),
    saved.map((t) => t.id),
    library.tracking.map((t) => t.title.id),
  ]);
  const openCalendar = () => {
    navigate("watchlist");
    setWatchlistTab("calendar");
  };
  const watchlistGroups = [
      {
        id: "lists",
        label: "Lists",
        tabs: [
          ["saved", "Saved"],
          ["watching", "Watching"],
          ["shared", "Shared"],
        ],
      },
      {
        id: "history",
        label: "History",
        tabs: [
          ["reviews", "Ratings"],
          ["liked", "Liked"],
          ["watched", "Watched"],
          ["hidden", "Hidden"],
        ],
      },
      {
        id: "plan",
        label: "Dates & stats",
        tabs: [
          ["calendar", "Calendar"],
          ["stats", "Stats"],
        ],
      },
    ];
  const watchlistScreen = view === "watchlist" && !submitted;
  const catalogueScreen = !watchlistScreen && !discovering && !upcoming && !gaming;
  const filterControls = (<div id="catalogue-filters" className="filter-panel">
              {!specialLibrary && <FilterPresets presets={library.filterPresets}
                current={{ view: view as FilterPreset["view"], provider: activeProvider, genre, sort, hideWatched, extra }}
                onSave={p => { library.setFilterPreset(p.id, p); setToast(`Saved filter “${p.name}”`); }}
                onRemove={id => library.setFilterPreset(id, null)}
                onApply={p => { navigate(p.view); setSubmitted(""); setQuery(""); setProvider(selected.includes(p.provider) ? p.provider : "mine");
                  setGenre(p.genre); setSort(p.sort); setHideWatched(p.hideWatched); setExtra(p.extra); setShowFilters(true);
                  setToast(`Applied “${p.name}”${p.provider !== "mine" && !selected.includes(p.provider) ? " using your current services" : ""}`); }} />}
              {!specialLibrary && (
                <>
                  <label>
                    Genre
                    <SelectControl value={genre} onChange={(e) => setGenre(e.target.value)}>
                      <option value="all">All genres</option>
                      {genres.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </SelectControl>
                  </label>
                  {!discovering && view !== "watchlist" && (
                    <label>
                      Sort by
                      <SelectControl value={sort} onChange={(e) => setSort(e.target.value)}>
                        <option value="recommended">{browsing ? "Most popular" : "Relevance"}</option>
                        <option value="newest">Newest first</option>
                        <option value="az">Title A–Z</option>
                        <option value="rating">Highest rated</option>
                      </SelectControl>
                    </label>
                  )}
                  {view !== "watchlist" && (
                    <label className="check-filter">
                      <input
                        type="checkbox"
                        checked={hideWatched}
                        onChange={(e) => setHideWatched(e.target.checked)}
                      />
                      Hide watched titles
                    </label>
                  )}
                  <ExtraFilterFields
                    value={extra}
                    onChange={setExtra}
                    onReset={resetFilters}
                    series={view === "series"}
                  />
                </>
              )}
            </div>);
  const serviceControls = <ServiceScope selected={selected} provider={activeProvider} disabled={!ready}
    compact={discovering} history={watchlistScreen} onManage={() => setDialog("services")}
    onChange={value => { restoreScroll.current = null; setProvider(value); }}/>;
  const catalogueActions = (
            <div className="catalogue-actions">
              {discovering&&<button className="text-button discovery-following" onClick={()=>openPerson(null,"","following")}>Following{library.followedPeople.length?` · ${library.followedPeople.length}`:""}</button>}
              {submitted && (
                <button className="text-button" aria-label="Clear search" onClick={clearSearch}>
                  <X size={15} /><span className="discovery-action-label">Clear search</span>
                </button>
              )}
              {serviceFilterEnabled && !upcoming && (
                <button
                  className={`filter-button ${showFilters ? "active" : ""}`}
                  aria-label="Filters"
                  aria-expanded={showFilters}
                  aria-controls="catalogue-filters"
                  onClick={() => setShowFilters(!showFilters)}
                >
                  <SlidersHorizontal size={16} /><span className="discovery-action-label">Filters</span> {hasFilters && <span className="active-dot" />}
                </button>
              )}
              {!discovering && !specialLibrary && !upcoming && !gaming && (
                <button
                  className="icon-button shuffle"
                  aria-label="Pick a title for me"
                  disabled={!filtered.length}
                  onClick={() => openTitle(filtered[Math.floor(Math.random() * filtered.length)])}
                >
                  <Shuffle size={18} />
                </button>
              )}
            </div>
  );
  const tabs: { id: View; label: string; icon: typeof Compass }[] = [
    { id: "discover", label: "Discover", icon: Compass },
    { id: "films", label: "Films", icon: Film },
    { id: "series", label: "TV series", icon: MonitorPlay },
    { id: "upcoming", label: "Upcoming", icon: CalendarDays },
    { id: "watchlist", label: "Watchlist", icon: Bookmark },
  ];
  if (library.gamingEnabled) tabs.splice(3, 0, { id: "gaming", label: "Gaming", icon: Gamepad2 });
  if (inSetup)
    return (
      <Welcome
        name={account.name}
        selected={selected}
        theme={library.theme}
        gamingEnabled={library.gamingEnabled}
        onCancel={library.onboarded ? () => setSetup(false) : undefined}
        onComplete={(services, theme, gaming) => {
          library.completeSetup(services, theme, gaming);
          setSetup(false);
          if (sharedToken) {
            navigate("watchlist");
            setWatchlistTab("shared");
          } else navigate("films");
          setToast("Your Scene is ready.");
        }}
      />
    );
  return (
    <>
      <SceneMotion />
      <QualityMonitor userId={account.id} enabled={library.sharePerformance && library.loaded} />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className={`site-header ${!halloween ? "screening-header" : ""} ${library.gamingEnabled ? "with-gaming" : ""}`}>
        <div className="header-inner">
          <button className="brand" onClick={() => navigate("discover")} aria-label="Scene home">
            <SceneWordmark decorative />
          </button>
          <nav className="desktop-nav" aria-label="Main navigation">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={view === t.id ? "active" : ""}
                aria-current={view === t.id ? "page" : undefined}
                onClick={() => navigate(t.id)}
              >
                {t.label}
                {t.id === "watchlist" && saved.length > 0 && <span className="count">{saved.length}</span>}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <span className="country">
              <Globe2 size={15} /> United Kingdom
            </span>
            <button
              className="account-button"
              disabled={!ready}
              onClick={() => setDialog("account")}
              aria-label="Your Scene account and settings"
            >
              <ProfileAvatar photo={library.avatar} name={account.name} />
            </button>
          </div>
        </div>
      </header>
      <main
        id="main"
        className={`page compact-page density-${library.home.density} ${view === "films" || view === "series" ? "library-browse" : ""} ${halloweenHome ? "seasonal-home" : discovering && !halloween ? "screening-home" : ""} ${watchlistScreen ? "watchlist-page" : ""}`}
      >
        <AppUpdateNotice pending={library.pending} />
        <section className="intro">
          <h1 className="sr-only">{heading}</h1>
          <div className={discovering && !halloween ? "discovery-toolbar" : undefined}>
            <div className="search-region" ref={searchRegion} onFocusCapture={()=>setSearchFocused(true)} onKeyDown={e=>{if(e.key==="Escape")setSearchFocused(false);}}>
          <form className="search-form" onSubmit={search} role="search">
            <label htmlFor="search" className="sr-only">
              {library.gamingEnabled
                ? "Search films, TV series, actors, directors and games"
                : "Search films, TV series, actors and directors"}
            </label>
            <Search size={21} />
            <input
              ref={searchInput}
              id="search"
              onKeyDown={e=>{if(e.key==="Escape")setSearchFocused(false);if(e.key==="ArrowDown"){const first=document.querySelector<HTMLButtonElement>("#search-suggestions button");if(first){e.preventDefault();first.focus();}}}}
              autoComplete="off"
              type="search"
              enterKeyHint="search"
              minLength={2}
              maxLength={100}
              placeholder={
                library.gamingEnabled ? "Search titles, people or games…" : "Search titles or people…"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" aria-label="Search" disabled={searching || query.trim().length < 2}>
              {searching ? <LoaderCircle className="spin" size={20} /> : <ArrowRight size={20} />}
            </button>
          </form>
          <SearchSuggestions query={query} accountId={account.id} active={searchFocused} onChoose={t=>{setSearchFocused(false);openTitle(t);}} onSearch={q=>{setQuery(q);void search(undefined,q);}}/>
            </div>
            {discovering && !halloween && catalogueActions}
          </div>
        </section>
        <section className="catalogue" aria-labelledby="results-heading">
          {!watchlistScreen && <div className={halloweenHome ? "halloween-catalogue-heading" : "catalogue-heading"}>
            <div>
              <h2 ref={resultHeading} id="results-heading" tabIndex={-1}>
                {heading}
                {view === "watchlist" && !submitted && !specialLibrary && (
                  <span className="heading-count">{filtered.length}</span>
                )}
              </h2>
            </div>
            {!(discovering && !halloween) && catalogueActions}
          </div>}
          {watchlistScreen && <WatchlistToolbar
            tab={watchlistTab} onTab={setWatchlistTab} count={specialLibrary ? undefined : filtered.length} headingRef={resultHeading}
            groups={watchlistGroups} syncStatus={library.status} syncDetails={<SyncStatus {...library}/>}
            collectionName={library.collections.find(c=>c.id===activeCollection)?.name}
            collections={<PersonalCollections collections={library.collections} saved={saved} active={activeCollection} onSelect={setActiveCollection} disabled={!ready} onCreate={name=>setActiveCollection(library.createCollection(name))} onRename={library.renameCollection} onDelete={library.deleteCollection} onMember={library.collectionMember}/>}
            filters={<>{serviceFilterEnabled && serviceControls}{watchlistTab === "saved" && <label className="watchlist-availability-filter">Availability<SelectControl value={availability} onChange={e=>setAvailability(e.target.value as AvailabilityFilter)}>{Object.entries(availabilityLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</SelectControl></label>}{filterControls}</>}
            filtersOpen={showFilters} onFiltersOpen={setShowFilters} filtersActive={hasFilters}
            sort={<label className="watchlist-sort">Sort by<SelectControl value={sort} onChange={e=>setSort(e.target.value)}><option value="recommended">Relevance</option><option value="newest">Newest first</option><option value="az">Title A–Z</option><option value="rating">Highest rated</option></SelectControl></label>}
            settings={<><p className="fine-print">Your saved history includes unavailable titles. Service filters show subscription and free offers only.</p><WatchlistTools automatic={library.autoAvailability} onAutomatic={library.setAutoAvailability} titles={saved} value={availability} onChange={setAvailability} onRefresh={library.refreshTitles}/></>}
            canShuffle={!specialLibrary && filtered.length>0} onShuffle={()=>openTitle(filtered[Math.floor(Math.random()*filtered.length)])}
          />}
          {!watchlistScreen && !catalogueScreen && serviceFilterEnabled && !upcoming && <div className={discovering && !halloween ? "discover-services-outside" : undefined}>{serviceControls}</div>}
          {!watchlistScreen && serviceFilterEnabled && !upcoming && (
            <MotionDrawer open={showFilters}>{catalogueScreen && serviceControls}{discovering && !halloween && <div className="discover-services-inside">{serviceControls}</div>}{filterControls}</MotionDrawer>
          )}
          {!specialLibrary && !upcoming && !gaming && (!discovering || hasFilters) && (
            <div className="results-bar">
              <p role="status" aria-live="polite">
                {discovering
                  ? "Filtered picks"
                  : catalogueLoading
                    ? browsing
                      ? "Loading catalogue…"
                      : "Searching titles…"
                    : view === "watchlist" && !submitted
                      ? `Showing ${filtered.length} of ${base.length} ${watchlistTab === "saved" ? "saved titles" : "titles in this view"}`
                    : browsing && !hasFilters
                      ? `${filtered.length} titles · from ${serviceScope}`
                      : `${filtered.length} ${filtered.length === 1 ? "title" : "titles"}${browsing ? ` · from ${serviceScope}` : ""}${submitted ? ` · ${searchPeople.length} ${searchPeople.length === 1 ? "person" : "people"}${library.gamingEnabled ? ` · ${gameResults.length} ${gameResults.length === 1 ? "game" : "games"}` : ""}` : browsing ? " loaded" : ""}`}
                {hasFilters && <button onClick={clearFilters}>Clear filters</button>}
                {browsing && browseBusy && browse.page > 0 ? " · Loading more…" : ""}
              </p>
            </div>
          )}
          {browsing && !needsServices && (browseError || browse.message) && (
            <div className="error-notice" role="alert">
              {browseError || browse.message}
              <button
                disabled={browseBusy}
                onClick={() => loadBrowse(browseRetryPage, browseRetryPage > 1, browseKey, true)}
              >
                Retry
              </button>
            </div>
          )}
          {searchError && !browsing && (
            <div className="error-notice" role="alert">
              {searchError}
              <button onClick={() => search()}>Retry</button>
            </div>
          )}
          <SectionBoundary section={view + (submitted ? ":search" : "")}><Suspense fallback={<p role="status">Loading this section…</p>}>
          {gaming && ready ? (
            <Gaming
              platforms={library.gamingPlatforms}
              onPlatform={library.setGamePlatform}
              collection={library.games}
              onStatus={setGameStatus}
            />
          ) : upcoming && ready ? (
            <Upcoming
              key={account.id}
              gaming={
                library.gamingEnabled
                  ? {
                      platforms: library.gamingPlatforms,
                      onPlatform: library.setGamePlatform,
                      collection: library.games,
                      onStatus: setGameStatus,
                    }
                  : undefined
              }
              serviceFilter={serviceFilter}
              filters={{ ...upcomingFilters, provider: activeProvider }}
              onFilters={setUpcomingFilters}
              onServices={() => setDialog("services")}
              {...cardActions}
            />
          ) : submitted ? (
            <SearchResults
              query={submitted}
              hasMore={searchHasMore} moreBusy={searchMoreBusy} moreError={searchMoreError} onLoadMore={loadMoreSearch}
              gameResults={library.gamingEnabled ? gameResults : undefined}
              gameCollection={library.games}
              onGameStatus={setGameStatus}
              titles={filtered}
              people={searchPeople}
              peopleHasMore={searchPeopleHasMore}
              peopleMessage={searchPeopleMessage}
              busy={catalogueLoading}
              onPerson={(p) => openPerson(p, submitted)}
              onMorePeople={() => openPerson(null, submitted)}
              onServices={() => setDialog("services")}
              {...cardActions}
            />
          ) : specialLibrary ? (
            watchlistTab === "stats" ? (
              <ViewingStats
                feedback={feedback}
                reviews={library.reviews}
                progressEntries={library.progressEntries}
                onOpen={openTitle}
              />
            ) : watchlistTab === "shared" ? (
              <SharedWatchlists
                accountId={account.id}
                onOpen={openTitle}
                inviteToken={sharedToken}
                onDismissInvite={() => setSharedToken("")}
              />
            ) : watchlistTab === "calendar" ? (
              <EpisodeCalendar spoilerFree={library.spoilerFree} items={scopedTracking} onOpen={openTitle} onEpisodes={onEpisodes} />
            ) : (
              <NextUp spoilerFree={library.spoilerFree} items={scopedTracking} onOpen={openTitle} onEpisodes={onEpisodes} />
            )
          ) : needsServices && view !== "watchlist" ? (
            <div className="empty-state">
              <SlidersHorizontal size={34} />
              <h3>Choose your services to get started</h3>
              <p>
                Scene shows films and series from the services you select. You can change them at any time in
                My services.
              </p>
              <button className="button primary" onClick={() => setDialog("services")}>
                Choose my services <ArrowRight size={16} />
              </button>
            </div>
          ) : discovering && ready ? (
            <DiscoverVariety order={displayedHomeSections}><div className="home-sections">
              {displayedHomeSections.map((id) => (
                  <div key={id} className="home-section">
                    {id === "arrivals" || id === "leaving" ? (
                      <ServiceActivity
                        mode={id === "arrivals" ? "new" : "leaving"}
                        {...cardActions}
                        genre={genre}
                        extra={extra}
                        hideWatched={hideWatched}
                      />
                    ) : id === "personal" ? (
                      <><ForYou
                        mode={library.recommendationMode} onMode={library.setRecommendationMode} onFavourites={library.addFavourites}
                        likedTitles={feedback.filter(f => f.liked).map(f => f.title)}
                        {...cardActions}
                        signature={recommendationSignature}
                        syncStatus={library.status}
                        syncMessage={library.message} storageWarning={library.storageWarning}
                        exclude={excluded}
                        genre={genre}
                        extra={extra}
                      />
                      {library.followedPeople.length>0&&<Suspense fallback={null}><PeopleFollowing compact accountId={account.id} follows={library.followedPeople} pending={library.pending} onFollow={library.followPerson} onPreferences={library.setPersonPreferences} onSeen={library.markPeopleUpdatesSeen} onChoose={p=>openPerson(p,"","following")} onSearch={()=>openPerson(null)} onViewAll={()=>openPerson(null,"","following")} onOpen={openTitle} onSave={cardActions.onSave} isSaved={cardActions.isSaved}/></Suspense>}</>
                    ) : id === "next" ? (
                      <NextUp
                        spoilerFree={library.spoilerFree}
                        compact
                        items={scopedTracking}
                        onOpen={openTitle}
                        onEpisodes={onEpisodes}
                        onViewAll={() => {
                          navigate("watchlist");
                          setWatchlistTab("watching");
                        }}
                      />
                    ) : id === "tonight" ? (
                      <Tonight {...cardActions} />
                    ) : id === "calendar" ? (
                      <EpisodeCalendar
                        spoilerFree={library.spoilerFree}
                        compact
                        items={scopedTracking}
                        onOpen={openTitle}
                        onEpisodes={onEpisodes}
                        onViewAll={openCalendar}
                      />
                    ) : (
                      <Discover
                        {...cardActions}
                        sectionId={id}
                        extra={extra}
                        hideWatched={hideWatched}
                        genre={genre}
                        onGenres={mergeDiscoverGenres}
                      />
                    )}
                  </div>
                ))}
              {visibleHomeSections.length > 4 && <button className="button secondary discover-more" aria-expanded={showMoreDiscover} onClick={() => setShowMoreDiscover(!showMoreDiscover)}>{showMoreDiscover ? "Show fewer sections" : "More to explore"}</button>}
              {!visibleHomeSections.length && (
                <div className="quiet-empty">
                  <h3>Your home screen is clear</h3>
                  <p>Choose sections in Account → Home screen & poster size.</p>
                  <button className="text-button" onClick={() => setDialog("account")}>
                    Customise home screen
                  </button>
                </div>
              )}
            </div></DiscoverVariety>
          ) : catalogueLoading ? (
            <div className="poster-grid" aria-label="Loading results">
              {Array.from({ length: 6 }, (_, i) => (
                <div className="skeleton-card" key={i}>
                  <div />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : filtered.length ? (
            <div className="poster-grid">
              {filtered.map((t) =>
                view === "watchlist" && watchlistTab === "reviews" && !submitted ? (
                  <div className="review-card" key={t.id}>
                    <TitleCard title={t} {...cardActions} />
                    <p>
                      {library.reviews.find((r) => sameTitle(r.title, t))?.rating
                        ? `Your rating: ${library.reviews.find((r) => sameTitle(r.title, t))!.rating}/5`
                        : "Private note"}
                    </p>
                    {library.reviews.find((r) => sameTitle(r.title, t))?.note && (
                      <p className="private-note-preview">
                        {library.reviews.find((r) => sameTitle(r.title, t))!.note}
                      </p>
                    )}
                  </div>
                ) : (
                  <TitleCard key={t.id} title={t} {...cardActions} />
                ),
              )}
            </div>
          ) : (
            <div className="empty-state">
              {view === "watchlist" ? <Bookmark size={34} /> : <Search size={34} />}
              <h3>
                {browsing && browseError
                  ? "The catalogue couldn’t load"
                  : view === "watchlist" && base.length > 0
                    ? "No titles match this view"
                  : view === "watchlist"
                    ? watchlistTab === "saved"
                      ? activeCollection ? "No saved titles in this collection view" : availability !== "all"
                        ? "No saved titles in this view"
                        : "Your next watch is waiting"
                      : watchlistTab === "reviews"
                        ? "Your personal film journal starts here"
                        : `No ${watchlistTab === "hidden" ? "hidden" : watchlistTab} titles yet`
                    : hasFilters
                      ? "No matches for these filters"
                      : "Nothing here just yet"}
              </h3>
              <p>
                {browsing && browseError
                  ? "Try loading the catalogue again."
                  : browsing && browse.hasMore
                    ? "No matching titles in this batch. Load more below, or adjust your filters."
                    : view === "watchlist" && base.length > 0
                      ? `None of the ${base.length} titles match the current filters. Your saved titles and service preferences are kept.`
                    : view === "watchlist"
                      ? watchlistTab === "reviews"
                        ? "Open a title to add a star rating or a private note. Both save to your Scene account."
                        : activeCollection ? "Open Manage collection to choose saved titles. If you have already added some, check your service and genre filters." : "Save titles with the bookmark, or open a title to mark it watched, liked or not interested. Your lists save to your own Scene account."
                      : hasFilters
                        ? "Try clearing your filters or updating My services. Only titles with confirmed availability on your selected services appear."
                        : "Try another title, or search the full UK guide on JustWatch."}
              </p>
              {!(browsing && browseError) && filterDescription && <p>{filterDescription}</p>}
              {hasFilters && !(browsing && browseError) && <button className="button secondary" onClick={changeFilters}>Change filters</button>}
              <button
                className="button primary"
                onClick={() =>
                  browsing && browseError
                    ? loadBrowse(browseRetryPage, browseRetryPage > 1, browseKey, true)
                    : hasFilters
                      ? clearFilters()
                      : navigate("discover")
                }
              >
                {browsing && browseError ? "Retry" : hasFilters ? "Clear filters" : "Explore picks"}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
          {browsing && !needsServices && !catalogueLoading && browse.hasMore && (
            <div className="browse-pagination">
              <button
                className="button secondary"
                disabled={browseBusy}
                onClick={() => loadBrowse(browse.page + 1, true)}
              >
                {browseBusy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}{" "}
                {browseBusy ? "Loading more…" : view === "films" ? "Load more films" : "Load more series"}
              </button>
              <p role="status" aria-live="polite">
                {browseBusy ? "Loading the next batch…" : "Keep browsing. Your filters apply to every page."}
              </p>
            </div>
          )}
          {browsing && !needsServices && browse.capped && (
            <p className="fine-print browse-limit">
              You’ve reached the catalogue’s browsing limit. Narrow your filters or search for a title to find
              more.
            </p>
          )}
          </Suspense></SectionBoundary>
          {submitted && (
            <a
              className="full-search"
              href={`https://www.justwatch.com/uk/search?q=${encodeURIComponent(submitted)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                <strong>Looking for more results?</strong>
                <span>Check the full UK streaming guide for “{submitted}” on JustWatch.</span>
              </span>
              <ArrowUpRight size={22} />
            </a>
          )}
        </section>
        <footer>
          <span className="footer-brand"><SceneWordmark /></span>
          <p>
            Your search starts here. Playback stays with the provider.
            <a
              className="footer-attribution"
              href="https://www.justwatch.com/uk"
              target="_blank"
              rel="noopener noreferrer"
            >
              Availability by JustWatch <ArrowUpRight size={11} />
            </a>
          </p>
          <button onClick={() => setDialog("about")}>About & data sources</button>
          <button onClick={() => setDialog("feedback")}>Feedback</button>
          <span className="footer-region">
            <Globe2 size={14} /> UK
          </span>
        </footer>
      </main>
      <nav
        className={`mobile-nav ${library.gamingEnabled ? "with-gaming" : ""}`}
        aria-label="Mobile navigation"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(t.id)}
            aria-current={view === t.id ? "page" : undefined}
            className={view === t.id ? "active" : ""}
          >
            <span className="mobile-nav-art" aria-hidden="true">{t.id === "series" ? <Tv size={24} strokeWidth={2} /> : <t.icon size={24} strokeWidth={2} />}</span>
            <span>
              {t.label}
              {t.id === "watchlist" && !library.gamingEnabled && saved.length > 0 ? ` (${saved.length})` : ""}
            </span>
          </button>
        ))}
      </nav>
      <dialog
        ref={modal}
        className={`modal ${dialog === "title" ? "title-modal" : ""}`}
        onCancel={() => setDialog(null)}
        onClose={() => setDialog(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setDialog(null);
        }}
        aria-labelledby="dialog-title"
      >
        <div className="modal-toolbar">
          <button className="close-dialog" aria-label="Close dialog" onClick={() => setDialog(null)}>
            <X size={21} />
          </button>
        </div>
        <div className="modal-inner">
          <SectionBoundary section={dialog || "closed"}><Suspense fallback={<p role="status">Loading…</p>}>
          {dialog === "feedback" && <><h2 id="dialog-title">Help improve Scene</h2><FeedbackForm /></>}
          {dialog === "people" && (
            <PeopleExplorer
              key={(person?.id || "search") + "-" + peopleQuery + "-" + peopleView + "-" + activeServices.join(",")}
              initialPerson={person}
              initialQuery={peopleQuery}
              initialView={peopleView}
              following={{accountId:account.id,follows:library.followedPeople,pending:library.pending,onFollow:library.followPerson,onPreferences:library.setPersonPreferences,onSeen:library.markPeopleUpdatesSeen}}
              {...cardActions}
            />
          )}
          {dialog === "releases" && <ReleaseManager />}
          {dialog === "account" && (
            <>
              <AccountPanel
                initialSection={accountSection}
                onInitialSectionHandled={() => setAccountSection(null)}
                viewingSettings={<SpoilerSettings enabled={library.spoilerFree} onChange={library.setSpoilerFree} />}
                avatar={library.avatar}
                onAvatarChange={library.setAvatar}
                experienceSettings={<TasteSetup onSave={library.addFavourites} likedTitles={feedback.filter(f => f.liked).map(f => f.title)} syncStatus={library.status} syncMessage={library.message} storageWarning={library.storageWarning} />}
                tasteProfileSettings={<TasteProfile feedback={feedback} ratings={library.reviews} ready={library.ready} loaded={library.loaded} syncStatus={library.status} onOpen={openTitle} />}
                feedbackSettings={<>
                  <FeedbackForm />
                  <label className="check-filter"><input type="checkbox" checked={library.sharePerformance} onChange={e => library.setSharePerformance(e.target.checked)} />Share performance totals</label>
                  <p className="fine-print">Optional. Sends grouped loading, tap-response and search/browse success measurements to Scene. No names, email addresses, searches or viewing history are included. Turn it off at any time.</p>
                  {account.role === "owner" && <FeedbackInbox />}
                </>}
                syncStatus={<SyncStatus {...library} />}
                gamingEnabled={library.gamingEnabled}
                gamingPlatforms={library.gamingPlatforms}
                onGamingChange={library.setGaming}
                onGamePlatform={library.setGamePlatform}
                onOpenGaming={() => {
                  setDialog(null);
                  navigate("gaming");
                }}
                onOpen={openTitle}
                onManageReleases={() => setDialog("releases")}
                onOpenFollowing={() => openPerson(null,"","following")}
                pending={library.pending}
                home={library.home}
                onHomeChange={library.setHome}
                theme={library.theme}
                onThemeChange={(theme) => {
                  library.setTheme(theme);
                  if (halloween) library.setSeasonal(false);
                }}
                seasonal={library.seasonal}
                onSeasonalChange={library.setSeasonal}
                onSetup={() => {
                  setDialog(null);
                  setSetup(true);
                }}
              />
            </>
          )}
          {dialog === "services" && (
            <>
              <p className="eyebrow">MAKE SCENE YOURS</p>
              <h2 id="dialog-title">Your services. Your picks.</h2>
              <p className="modal-intro">
                Choose the services you use. Scene automatically shows titles available through these
                services, and saves your choices to your own Scene account.
              </p>
              <SyncStatus {...library} />
              <div className="service-options">
                {services.map((s) => (
                  <label key={s.key} className={selected.includes(s.key) ? "chosen" : ""}>
                    <ServiceMark serviceKey={s.key} />
                    <span>
                      {s.name}
                      {s.key === "bbc" && <small>BBC One &amp; BBC Two</small>}
                    </span>
                    <input
                      type="checkbox"
                      checked={selected.includes(s.key)}
                      onChange={() => library.service(s.key, !selected.includes(s.key))}
                    />
                  </label>
                ))}
              </div>
              <p className="fine-print">
                Your preferences are private to your sign-in. This doesn’t sign in to streaming accounts or
                confirm your subscription tier. Add-on channels are separate subscriptions.
              </p>
              <div className="modal-footer">
                <span>{selected.length} services selected</span>
                <button className="button primary" onClick={() => setDialog(null)}>
                  Done <Check size={16} />
                </button>
              </div>
            </>
          )}
          {dialog === "about" && (
            <>
              <p className="eyebrow">A LITTLE TRANSPARENCY</p>
              <h2 id="dialog-title">One place to start watching.</h2>
              <div className="about-body">
                <p>
                  Scene helps you find films and series, remember what you want to watch, and open UK viewing
                  options. You watch through the provider and keep your existing subscriptions.
                </p>
                <h3>{live ? "Live catalogue connected" : "This is the starter version"}</h3>
                {live && feed === "tmdb" ? (
                  <>
                    <h4>Browsing and search</h4>
                    <ul className="about-list">
                      <li>
                        Films and TV Series browse the TMDB catalogue page by page, starting with popular
                        titles.
                      </li>
                      <li>Browsing uses your selected services. Search also shows title matches without confirmed availability on those services, so you can save them and check with the provider.</li>
                      <li>
                        Subscription and free/ad-supported offers on your services appear together; rental and
                        purchase offers are excluded.
                      </li>
                      <li>
                        Genre, year, score, original-language and film-length filters narrow the results.
                      </li>
                      <li>
                        Discover has live popular, highly rated, recent-release and short-film sections. For
                        you uses up to three liked or highly rated titles and skips titles already in your
                        saved history.
                      </li>
                    </ul>
                    <h4>Your lists</h4>
                    <ul className="about-list">
                      <li>Your watchlist keeps saved titles visible even when they leave your services.</li>
                      <li>
                        Mark titles watched, liked or not interested. Hidden titles can be restored from
                        Watchlist → Hidden.
                      </li>
                      <li>
                        Use Check saved titles to refresh watchlist availability; checks older than 24 hours
                        are marked for review.
                      </li>
                    </ul>
                    <h4>Upcoming and reminders</h4>
                    <ul className="about-list">
                      <li>
                        Upcoming → Streaming shows selected UK provider announcements, including returning
                        seasons, filtered by My services. It’s a selection reviewed daily, not a complete
                        calendar.
                      </li>
                      <li>
                        Follow a streaming release with Remind me, then turn on device notifications in your
                        account for a reminder on its announced date.
                      </li>
                      <li>
                        Upcoming → Cinema & digital shows announced UK cinema and digital film dates,
                        regardless of My services.
                      </li>
                      <li>
                        The episode calendar shows published air dates for tracked series, which may differ
                        from UK streaming dates. None of these dates confirm a title is in your subscription,
                        and they can change.
                      </li>
                    </ul>
                    <h4>Where the data comes from</h4>
                    <ul className="about-list">
                      <li>Search and title checks use TMDB. UK availability is supplied by JustWatch.</li>
                      <li>Standard viewing links open TMDB’s watch-options page.</li>
                      <li>Optional direct provider links use Watchmode, only when you ask for them.</li>
                    </ul>
                  </>
                ) : (
                  <p>
                    {live
                      ? "Search uses Watchmode for films, TV and UK availability. Curated picks and watchlist cards show saved listings; opening a title refreshes them. Coverage varies by provider, title and subscription tier. Confirm the offer with the provider before paying."
                      : "The starting collection includes curated films and series. TV title search connects to TVmaze. Offers on curated titles were checked on 17 October 2026: a snapshot, not continuously updated. New TV results may have no confirmed UK offers. Use “Check on JustWatch” to verify."}
                  </p>
                )}
                {!live && (
                  <p>
                    Live film and TV availability is temporarily unconfigured. Curated picks remain available.
                  </p>
                )}
                <h3>Optional Gaming</h3>
                <p>
                  Enable Gaming in your account settings to browse a selected game catalogue, filter by
                  platform and keep a private Play later, Playing and Finished list. Games also appear in the
                  main search and in Upcoming → Games when Gaming is enabled. Game details link to official
                  publisher or platform pages. Coverage is a selection, checked on the date shown; it is not a
                  live or complete catalogue. Platform dates and editions may differ. Game subscription
                  inclusion is not tracked. Turning Gaming off keeps your saved games and platform choices.
                </p>
                <h3>Your data stays with you</h3>
                <ul className="about-list">
                  <li>
                    Account → Your data &amp; account lets you download your personal Scene records or
                    permanently delete your account. Deletion also removes shared lists you own and your
                    contributions to other lists. The last active owner cannot delete their account.
                  </li>
                  <li>
                    Your theme, home layout, private ratings and notes, watchlist, liked, watched and hidden
                    titles, followed actors and directors, and selected services save to your Scene account and sync across devices.
                  </li>
                  <li>
                    Each person has a separate library. Members can’t read each other’s private libraries.
                    Episode tracking is manual and private. Spoiler-free mode hides unwatched episode titles and title synopses until you reveal them. The series guide shows listed status, season counts and estimated viewing time.
                  </li>
                  <li>
                    Shared lists show invited members only the titles added to them, participant names and
                    vote totals, never your personal watchlist or episode history.
                  </li>
                  <li>
                    The project owner and authorised database administrators can inspect stored records; this
                    is not end-to-end encrypted. Accounts and saved data are stored with Supabase.
                  </li>
                  <li>
                    Removing someone’s access blocks future requests but doesn’t erase stored records or a
                    copy already on their device.
                  </li>
                  <li>
                    A local copy keeps browsing available offline after sign-in; pending changes sync when you
                    reconnect. Use My services or Watchlist to check saving status, and sync pending changes
                    before signing out.
                  </li>
                  <li>
                    Tab filters, browsing position and catalogue caches are kept separately for each account.
                    When this browser detects sign-out, it clears that account’s local copy where it can.
                    Catalogue responses are cached for up to 10 minutes.
                  </li>
                  <li>
                    Search queries are sent to our catalogue sources. The owner’s existing browser lists are
                    merged on first use.
                  </li>
                  <li>Scene doesn’t ask for your streaming passwords and doesn’t play or download films.</li>
                </ul>
                <h3>Sources & credits</h3>
                <div className="tmdb-credit">
                  <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">
                    <img src="/tmdb-logo.svg" width="110" height="15" alt="TMDB" />
                  </a>
                  <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
                  <p>
                    Streaming availability data is provided by{" "}
                    <a href="https://www.justwatch.com/uk" target="_blank" rel="noopener noreferrer">
                      JustWatch
                    </a>
                    .
                  </p>
                </div>
                <p>
                  TV metadata and artwork:{" "}
                  <a href="https://www.tvmaze.com" target="_blank" rel="noreferrer">
                    TVmaze
                  </a>
                  , data under{" "}
                  <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">
                    CC BY-SA
                  </a>
                  . Curated availability and film references:{" "}
                  <a href="https://www.justwatch.com/uk" target="_blank" rel="noreferrer">
                    JustWatch UK
                  </a>
                  . Optional direct provider links:{" "}
                  <a href="https://api.watchmode.com/" target="_blank" rel="noreferrer">
                    Watchmode
                  </a>
                  . Individual title details link to their sources. Artwork and service names belong to their
                  respective owners. Scene is an independent personal project.
                </p>
              </div>
              <button className="button primary" onClick={() => setDialog(null)}>
                Back to discovering <ArrowRight size={17} />
              </button>
            </>
          )}
          {dialog === "title" && detail && (
            <>
              <div className="detail-top">
                <div className="detail-poster">
                  <Poster title={detail} priority />
                </div>
                <div className="detail-heading">
                  <p className="eyebrow">
                    {detail.kind === "movie" ? "MOVIE NIGHT MATERIAL" : "YOUR NEXT SERIES"}
                  </p>
                  <h2 id="dialog-title">{detail.name}</h2>
                  <p className="detail-meta">
                    {detail.year || "Year unknown"} · {detail.kind === "movie" ? "Film" : "TV series"}
                    {detail.runtime
                      ? ` · ${detail.runtime} min${detail.kind === "series" ? " / episode" : ""}`
                      : ""}
                  </p>
                  <ReleaseBadge release={detail.upcomingRelease} detail />
                  <ReminderButton title={detail} />
                  <div className="genre-tags">
                    {detail.genres.slice(0, 3).map((g) => (
                      <span key={g}>{g}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="detail-actions" aria-label="Title actions">
                <button className="button primary" onClick={() => {
                  const target = document.getElementById("where-to-watch");
                  target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "start", behavior: "instant" });
                }}>Where to watch <ArrowRight size={17}/></button>
                <button className={`button secondary ${isSaved(detail) ? "saved" : ""}`} aria-pressed={isSaved(detail)} onClick={() => toggleSave(detail)}>
                  {isSaved(detail) ? <Check size={17}/> : <Plus size={17}/>} {isSaved(detail) ? "On watchlist" : "Add to watchlist"}
                </button>
                <button className={`button secondary ${findFeedback(feedback, detail)?.watched ? "saved" : ""}`}
                  aria-pressed={Boolean(findFeedback(feedback, detail)?.watched)} onClick={() => onFeedback(detail, "watched")}>
                  <Check size={17}/>{findFeedback(feedback, detail)?.watched ? "Watched" : "Mark watched"}
                </button>
              </div>
              <details className="detail-synopsis" key={"synopsis-" + detail.id}><summary>Synopsis</summary>
                <div className="detail-summary"><SpoilerContent hidden={library.spoilerFree && !feedback.some(f => sameTitle(f.title, detail) && f.watched)} identity={detail.id} label="synopsis">
                  {detail.summary || "No synopsis is available for this title yet."}
                </SpoilerContent></div>
              </details>
              <TitleExtrasPanel
                key={"extras-" + detail.id}
                onPerson={openPerson}
                title={detail}
                {...cardActions}
                hideWatched={hideWatched}
              >
                <div className="where-heading">
                  <h3 id="where-to-watch" tabIndex={-1}>Where to watch</h3>
                  <span>
                    <Globe2 size={14} /> United Kingdom
                  </span>
                </div>
                {detailBusy && (
                  <p className="refresh-status" role="status">
                    <LoaderCircle size={15} className="spin" /> Refreshing title details…
                  </p>
                )}
                {detailError && (
                  <p className="error-notice" role="alert">
                    {detailError}
                  </p>
                )}
                <WatchOptions title={detail} offers={detailOffers} selected={activeServices}/>
                <p className="fine-print availability-credit">
                  {detail.dataSource === "tmdb" ? <>Availability by <a href="https://www.justwatch.com/uk" target="_blank" rel="noopener noreferrer">JustWatch</a> via TMDB. </> : "UK availability listings. "}
                  {checkedDate ? `Retrieved ${checkedDate}. ` : "Last check date unavailable. "}
                  {directOffers ? "Direct provider links refreshed. " : ""}Availability, seasons and tiers can change. Check that the title is included in your plan.
                </p>
                {canLoadDirect && detail.dataSource === "tmdb" && !directOffers && (
                  <div className="direct-links-option">
                    <button
                      className="button secondary"
                      disabled={detailBusy || directBusy}
                      onClick={loadDirectLinks}
                    >
                      {directBusy ? <LoaderCircle className="spin" size={16} /> : <ArrowUpRight size={16} />}{" "}
                      {directBusy ? "Loading direct links…" : "Get direct provider links"}
                    </button>
                    <p className="fine-print">
                      Optional: uses Watchmode credits. Standard watch options don’t use them.
                    </p>
                  </div>
                )}
                {directMessage && (
                  <p className="fine-print" role="status">
                    {directMessage}
                  </p>
                )}
                <a
                  className="button secondary full-width"
                  href={availabilityUrl(detail)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {detail.dataSource === "tmdb" ? "View UK watch options" : "Check on JustWatch UK"}{" "}
                  <ArrowUpRight size={17} />
                </a>
                <SeriesGuide key={"guide-" + detail.id} title={detail} progress={library.progressEntries.find(e => sameTitle(e.title, detail))?.progress} />
                <ShareTitle
                  key={"share-" + (detail.tmdbId || detail.id)}
                  title={detail}
                  onManage={() => {
                    setDialog(null);
                    navigate("watchlist");
                    setWatchlistTab("shared");
                  }}
                />
                <EpisodeTracker
                  spoilerFree={library.spoilerFree}
                  onSpoilerFreeChange={library.setSpoilerFree}
                  key={"episodes-" + (detail.tmdbId || detail.id)}
                  title={detail}
                  progress={library.progressEntries.find((e) => sameTitle(e.title, detail))?.progress}
                  onTrack={library.track}
                  onEpisodes={onEpisodes}
                />
                <FeedbackButtons title={detail} feedback={feedback} onFeedback={onFeedback} />
                <PersonalReview
                  key={"review-" + detail.id}
                  title={detail}
                  rating={library.reviews.find((r) => sameTitle(r.title, detail))?.rating || null}
                  note={library.reviews.find((r) => sameTitle(r.title, detail))?.note || ""}
                  onChange={library.review}
                />
                {(undoFeedback || library.canUndo) && toast && (
                  <button className="text-button" onClick={undoLastFeedback}>
                    Undo last change
                  </button>
                )}
                <FeedbackForm key={"report-" + detail.id} title={detail} defaultKind="availability" />
              </TitleExtrasPanel>
              {safeUrl(detail.sourceUrl) && (
                <p className="source-credit">
                  Title information:{" "}
                  <a href={safeUrl(detail.sourceUrl)} target="_blank" rel="noopener noreferrer">
                    {detail.sourceUrl?.includes("tvmaze")
                      ? "TVmaze"
                      : detail.sourceUrl?.includes("themoviedb")
                        ? "TMDB"
                        : "Source"}{" "}
                    <ArrowUpRight size={11} />
                  </a>
                </p>
              )}
            </>
          )}
          </Suspense></SectionBoundary>
        </div>
      </dialog>
      <div
        className={`toast ${toast ? "visible" : ""} ${toastWarning ? "warning" : ""}`}
        role="status"
        aria-live="polite"
      >
        {toastWarning ? <Info size={17} /> : <Check size={17} />}
        <span key={toast} className="toast-message">{toast}</span>
        {(undoFeedback || library.canUndo) && <button onClick={undoLastFeedback}>Undo</button>}
      </div>
    </>
  );
}
