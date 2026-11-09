import {cleanManga,cleanMangaCollection,validMangaFields,type Manga,type MangaProgress,type MangaCollection} from "./manga-state";
import { collectionId, collectionName, readCollections, type PersonalCollection } from "./collections";
import { cleanPreset, isRecommendationMode, type FilterPreset, type RecommendationMode } from "./filter-presets";
import { cleanFollowPerson, readFollows, validPersonPreferences, peopleFollowLimit, type FollowedPerson, type PersonPreferences } from "./people-following";
import type { Person } from "./people";
import { validProfilePhoto } from "./profile-photo";
import {
  cleanGameCollection,
  cleanGameSnapshot,
  cleanGameSnapshots,
  gamePlatforms,
  isGameId,
  isGamePlatform,
  isGameStatus,
  type GameCollection,
  type GamePlatform,
  type GameStatus,
  type Game,
} from "./gaming-state";
import { cleanUpcomingRelease } from "./upcoming";
import { resolveHome, validHomePatch, migrateHomePatch, type HomePreferences } from "./home-preferences";
import { services, sameTitle, type Title } from "./catalogue";
import { type Feedback } from "./preferences";
import { isTheme, resolveTheme, type ThemeId } from "./themes";
import { validEpisodeNumber, type SeriesProgress } from "./episodes";

export type LibraryEntry = {
  title: Title;
  saved?: boolean;
  watched?: boolean;
  liked?: boolean;
  hidden?: boolean;
  progress?: SeriesProgress;
  rating?: number | null;
  note?: string;
};
export type LibraryDocument = {
  entries: Record<string, LibraryEntry>;
  services: Record<string, boolean>;
  receipts: string[];
  manga?: MangaCollection;
  games?: GameCollection;
  gameDetails?: Record<string, Game>;
  preferences?: {
    collections?: Record<string, PersonalCollection | null>;
    followedPeople?: Record<string, FollowedPerson | null>;
    filterPresets?: Record<string, FilterPreset | null>;
    recommendationMode?: RecommendationMode;
    sharePerformance?: boolean;
    spoilerFree?: boolean;
    avatar?: string | null;
    gaming?: boolean;
    gamePlatforms?: Partial<Record<GamePlatform, boolean>>;
    autoAvailability?: boolean;
    seasonal?: boolean;
    theme?: ThemeId;
    onboarded?: boolean;
    home?: Partial<HomePreferences>;
  };
};
export type ReviewFields = { rating?: number | null; note?: string };
export type LibraryOperation =
  | {type:"manga-progress";manga:Manga;fields:Partial<MangaProgress>|null}
  | {type:"collection";id:string;action:"create"|"rename"|"delete";name?:string}
  | {type:"collection-member";id:string;key:string;value:boolean}
  | { type: "person-follow"; person: Person; value: boolean; at: number }
  | { type: "person-preferences"; id: number; fields: PersonPreferences; at: number }
  | { type: "filter-preset"; id: string; value: FilterPreset | null }
  | { type: "recommendation-mode"; value: RecommendationMode }
  | { type: "share-performance"; value: boolean }
  | { type: "spoiler-free"; value: boolean }
  | { type: "avatar"; value: string | null }
  | { type: "gaming"; value: boolean }
  | { type: "game-platform"; key: GamePlatform; value: boolean }
  | { type: "game-status"; id: string; value: GameStatus | null; game?: Game }
  | { type: "auto-availability"; value: boolean }
  | { type: "seasonal"; value: boolean }
  | { type: "refresh"; title: Title }
  | { type: "home"; fields: Partial<HomePreferences> }
  | { type: "review"; title: Title; fields: ReviewFields }
  | { type: "onboard"; value: true }
  | { type: "tracking"; title: Title; value: boolean }
  | { type: "episode"; title: Title; season: number; episodes: number[]; value: boolean }
  | { type: "theme"; value: ThemeId }
  | { type: "service"; key: string; value: boolean; import?: boolean }
  | {
      type: "title";
      title: Title;
      fields: Partial<Record<"saved" | "watched" | "liked" | "hidden", boolean>>;
      import?: boolean;
    };
export type Mutation = { id: string; operations: LibraryOperation[]; undoOf?: string; undoBase?: string | null };
export function canUndoMutation(source: LibraryDocument, id: string, before: string | null) {
  return source.receipts.at(-1) === id && (source.receipts.at(-2) ?? null) === before;
}
// Undo is deliberately conservative: a newer update on any device wins.
// Use the same receipt check during optimistic replay and the server's revision-checked write.
export function applyMutation(source: LibraryDocument, batch: Mutation): LibraryDocument {
  if (source.receipts.includes(batch.id)) return source;
  const allowed = !batch.undoOf || canUndoMutation(source, batch.undoOf, batch.undoBase ?? null);
  const document = allowed ? applyOperations(source, batch.operations) : { ...source };
  return { ...document, receipts: [...document.receipts, batch.id].slice(-200) };
}
export const emptyLibrary = (): LibraryDocument => ({ entries: {}, services: {}, receipts: [] });
export function titleKey(t: Title) {
  return t.tmdbId ? `tmdb-${t.kind}-${t.tmdbId}` : t.imdbId ? `imdb-${t.imdbId}` : t.id;
}
export function applyOperations(source: LibraryDocument, operations: LibraryOperation[]): LibraryDocument {
  const doc = {
    manga: cleanMangaCollection(source.manga),
    games: cleanGameCollection(source.games),
    gameDetails: cleanGameSnapshots(source.gameDetails),
    entries: Object.assign(Object.create(null), source.entries) as Record<string, LibraryEntry>,
    services: { ...source.services },
    receipts: [...source.receipts],
    preferences: { ...source.preferences },
  };
  for (const op of operations) {
    if(op.type==="manga-progress"){const id=op.manga.id,old=doc.manga[id];if(op.fields===null)delete doc.manga[id];else {if(!old&&Object.keys(doc.manga).length>=500)throw Error("You can track up to 500 manga.");doc.manga[id]={manga:op.manga,progress:{...(old?.progress||{status:"planned",chapters:0,volumes:0}),...op.fields}};}continue;}
    if(op.type === "collection" || op.type === "collection-member") {
      const collections = {...doc.preferences.collections}, old = collections[op.id];
      if(op.type === "collection") {
        if(op.action === "create" && !Object.prototype.hasOwnProperty.call(collections,op.id)) {
          if(readCollections(collections).length>=20)throw Error("You can have up to 20 collections.");
          collections[op.id]={id:op.id,name:op.name!,members:{}};
        } else if(op.action === "rename" && old) collections[op.id]={...old,name:op.name!};
        else if(op.action === "delete") collections[op.id]=null;
      } else if(old) {
        if(op.value&&!Object.values(doc.entries).some(e=>e.saved&&titleKey(e.title)===op.key))continue;
        if(op.value && !old.members[op.key] && Object.values(old.members).filter(Boolean).length>=500)throw Error("A collection can contain up to 500 titles.");
        collections[op.id]={...old,members:{...old.members,[op.key]:op.value}};
      }
      doc.preferences.collections=collections;continue;
    }

    if (op.type === "person-follow") {
      const follows={...doc.preferences.followedPeople},id=String(op.person.id);
      if(op.value&&!follows[id]&&readFollows(follows).length>=peopleFollowLimit)throw Error("You can follow up to 20 people. Unfollow someone first.");
      follows[id]=op.value?(follows[id]||{person:op.person,role:"all",alerts:false,followedAt:op.at,seenThrough:op.at}):null;
      if(Object.keys(follows).length>200)for(const key of Object.keys(follows))if(follows[key]===null&&key!==id)delete follows[key];
      doc.preferences.followedPeople=follows;continue;
    }
    if(op.type==="person-preferences"){
      const follows={...doc.preferences.followedPeople},old=follows[String(op.id)];
      if(old){const next={...old,...op.fields,seenThrough:Math.max(old.seenThrough,op.fields.seenThrough||0)};
       if(op.fields.alerts===true&&!old.alerts)next.seenThrough=Math.max(next.seenThrough,op.at);
       follows[String(op.id)]=next;doc.preferences.followedPeople=follows;}
      continue;
    }
    if (op.type === "filter-preset") {
      const presets = { ...doc.preferences.filterPresets };
      if (op.value && !presets[op.id] && Object.values(presets).filter(Boolean).length >= 12) throw Error("You can save up to 12 filters.");
      // Deletions retain a tombstone so an older device cannot restore the preset.
      presets[op.id] = op.value;
      if (Object.keys(presets).length > 100) {
        for (const key of Object.keys(presets)) if (presets[key] === null && key !== op.id) delete presets[key];
      }
      doc.preferences.filterPresets = presets;
      continue;
    }
    if (op.type === "recommendation-mode") { doc.preferences.recommendationMode = op.value; continue; }
    if (op.type === "spoiler-free") { doc.preferences.spoilerFree = op.value; continue; }
    if (op.type === "share-performance") { doc.preferences.sharePerformance = op.value; continue; }
    if (op.type === "avatar") {
      if (op.value !== null && !validProfilePhoto(op.value)) throw Error("Invalid profile photo.");
      doc.preferences.avatar = op.value;
      continue;
    }
    if (op.type === "gaming") {
      doc.preferences.gaming = op.value;
      continue;
    }
    if (op.type === "game-platform") {
      doc.preferences.gamePlatforms = { ...doc.preferences.gamePlatforms, [op.key]: op.value };
      continue;
    }
    if (op.type === "game-status") {
      if (op.value) {
        if (!doc.games[op.id] && Object.keys(doc.games).length >= 500) throw Error("You can save up to 500 games.");
        doc.games[op.id] = op.value;
        const game = cleanGameSnapshot(op.game);
        if (game?.id === op.id) doc.gameDetails[op.id] = game;
      } else { delete doc.games[op.id]; delete doc.gameDetails[op.id]; }
      continue;
    }
    if (op.type === "auto-availability") {
      doc.preferences.autoAvailability = op.value;
      continue;
    }
    if (op.type === "seasonal") {
      doc.preferences.seasonal = op.value;
      continue;
    }
    if (op.type === "home") {
      doc.preferences.home = { ...resolveHome(doc.preferences.home), ...op.fields };
      continue;
    }
    if (op.type === "onboard") {
      doc.preferences.onboarded = true;
      continue;
    }
    if (op.type === "theme") {
      doc.preferences.theme = op.value;
      continue;
    }
    if (op.type === "service") {
      if (!op.import || doc.services[op.key] === undefined) doc.services[op.key] = op.value;
      continue;
    }
    const key =
        Object.keys(doc.entries).find((k) => sameTitle(doc.entries[k].title, op.title)) || titleKey(op.title),
      old = doc.entries[key];
    if (op.type === "refresh") {
      if (old) doc.entries[key] = { ...old, title: op.title };
      continue;
    }
    const importing = "import" in op && op.import;
    const next: LibraryEntry = { ...old, title: importing && old ? old.title : op.title };
    if (op.type === "review") {
      if ("rating" in op.fields) next.rating = op.fields.rating;
      if ("note" in op.fields) next.note = op.fields.note;
      if (!old && Object.keys(doc.entries).length >= 1500) throw Error("Your library is full.");
      doc.entries[key] = next;
      continue;
    }
    if (op.type === "episode" || op.type === "tracking") {
      const progress: SeriesProgress = {
        tracking: old?.progress?.tracking ?? false,
        episodes: { ...old?.progress?.episodes },
      };
      if (op.type === "tracking") progress.tracking = op.value;
      else {
        progress.tracking = true;
        const season = { ...progress.episodes[String(op.season)] };
        for (const episode of op.episodes) season[String(episode)] = op.value;
        progress.episodes[String(op.season)] = season;
      }
      next.progress = progress;
      if (!old && Object.keys(doc.entries).length >= 1500) throw Error("Your library is full.");
      doc.entries[key] = next;
      continue;
    }
    for (const field of ["saved", "watched", "liked", "hidden"] as const) {
      if (typeof op.fields[field] === "boolean" && (!op.import || next[field] === undefined))
        next[field] = op.fields[field];
    }
    // Imported history must not make a title both liked and hidden.
    if (next.hidden && next.liked) next.liked = false;
    if (!old && Object.keys(doc.entries).length >= 1500)
      throw Error("Your library is full. Existing titles can still be updated.");
    doc.entries[key] = next;
  }
  return doc;
}
export function projectLibrary(doc: LibraryDocument) {
  const entries = Object.values(doc.entries);
  return {
    collections: readCollections(doc.preferences?.collections),
    followedPeople: readFollows(doc.preferences?.followedPeople),
    filterPresets: Object.values(doc.preferences?.filterPresets || {}).map(cleanPreset).filter((p): p is FilterPreset => !!p).slice(0, 12),
    recommendationMode: isRecommendationMode(doc.preferences?.recommendationMode) ? doc.preferences!.recommendationMode! : "balanced" as RecommendationMode,
    sharePerformance: doc.preferences?.sharePerformance === true,
    spoilerFree: doc.preferences?.spoilerFree === true,
    avatar: validProfilePhoto(doc.preferences?.avatar) ? doc.preferences!.avatar! : null,
    gamingEnabled: doc.preferences?.gaming === true,
    gamingPlatforms: gamePlatforms
      .filter((p) => doc.preferences?.gamePlatforms?.[p.id] === true)
      .map((p) => p.id),
    manga: cleanMangaCollection(doc.manga),
    games: cleanGameCollection(doc.games),
    gameDetails: cleanGameSnapshots(doc.gameDetails),
    autoAvailability: doc.preferences?.autoAvailability !== false,
    seasonal: doc.preferences?.seasonal !== false,
    home: resolveHome(doc.preferences?.home),
    reviews: entries
      .filter((e) => e.rating || e.note)
      .map((e) => ({ title: e.title, rating: e.rating || null, note: e.note || "" })),
    onboarded: doc.preferences?.onboarded === true,
    tracking: entries
      .filter((e) => e.progress?.tracking && e.title.kind === "series")
      .map((e) => ({ title: e.title, progress: e.progress! })),
    progressEntries: entries
      .filter((e) => e.progress)
      .map((e) => ({ title: e.title, progress: e.progress! })),
    theme: resolveTheme(doc.preferences?.theme),
    saved: entries
      .filter((e) => e.saved)
      .map((e) => e.title)
      .reverse(),
    selected: services.filter((s) => doc.services[s.key]).map((s) => s.key),
    feedback: entries
      .filter((e) => e.watched || e.liked || e.hidden)
      .map((e) => ({ title: e.title, watched: !!e.watched, liked: !!e.liked, hidden: !!e.hidden })),
  };
}
export function importOperations(
  saved: Title[],
  feedback: Feedback[],
  selected: string[],
): LibraryOperation[] {
  return [
    ...saved.map((title) => ({ type: "title" as const, title, fields: { saved: true }, import: true })),
    ...feedback.map((f) => ({
      type: "title" as const,
      title: f.title,
      fields: {
        ...(f.watched ? { watched: true } : {}),
        ...(f.liked ? { liked: true } : {}),
        ...(f.hidden ? { hidden: true } : {}),
      },
      import: true,
    })),
    ...selected.map((key) => ({ type: "service" as const, key, value: true, import: true })),
  ];
}
export function cleanTitle(value: any): Title | null {
  if (
    !value ||
    typeof value.id !== "string" ||
    !/^[-\w:]{1,100}$/.test(value.id) ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    !["movie", "series"].includes(value.kind)
  )
    return null;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const url = (v: unknown) =>
    typeof v === "string" && v.length < 1000 && v.startsWith("https://") ? v : undefined;
  return {
    upcomingRelease:
      value.upcomingRelease?.kind === "streaming" ||
      (value.kind === "series") === (value.upcomingRelease?.kind === "series")
        ? cleanUpcomingRelease(value.upcomingRelease)
        : undefined,
    id: value.id,
    name: value.name.slice(0, 250),
    year: Number.isInteger(value.year) ? value.year : null,
    kind: value.kind,
    genres: Array.isArray(value.genres)
      ? value.genres
          .filter((g: unknown) => typeof g === "string")
          .slice(0, 12)
          .map((g: string) => g.slice(0, 80))
      : [],
    summary: text(value.summary, 2500) || "",
    poster: url(value.poster) || null,
    runtime: Number.isFinite(value.runtime) && value.runtime > 0 ? Math.min(value.runtime, 10000) : null,
    originalLanguage:
      typeof value.originalLanguage === "string" && /^[a-z]{2}$/.test(value.originalLanguage)
        ? value.originalLanguage
        : undefined,
    rating: Number.isFinite(value.rating) ? value.rating : null,
    voteCount: Number.isFinite(value.voteCount) ? value.voteCount : undefined,
    tmdbId: Number.isSafeInteger(value.tmdbId) && value.tmdbId > 0 ? value.tmdbId : undefined,
    tvmazeId: Number.isSafeInteger(value.tvmazeId) && value.tvmazeId > 0 ? value.tvmazeId : undefined,
    imdbId: typeof value.imdbId === "string" && /^tt\d+$/.test(value.imdbId) ? value.imdbId : undefined,
    sourceUrl: url(value.sourceUrl),
    officialUrl: url(value.officialUrl),
    availabilitySource: url(value.availabilitySource),
    checked: text(value.checked, 40),
    live: value.live === true,
    dataSource: ["tmdb", "tvmaze", "watchmode"].includes(value.dataSource) ? value.dataSource : undefined,
    offers: Array.isArray(value.offers)
      ? value.offers
          .filter(
            (o: any) =>
              o &&
              typeof o.name === "string" &&
              typeof o.key === "string" &&
              ["sub", "free", "rent", "buy"].includes(o.type) &&
              url(o.url),
          )
          .slice(0, 20)
          .map((o: any) => ({
            name: o.name.slice(0, 100),
            key: o.key.slice(0, 100),
            type: o.type,
            url: o.url,
            linkKind: o.linkKind === "direct" ? "direct" : "guide",
            price: Number.isFinite(o.price) ? o.price : null,
          }))
      : [],
  };
}
export function validateMutation(body: any): { revision: number; mutation: Mutation } | null {
  if (
    !body ||
    !Number.isSafeInteger(body.revision) ||
    body.revision < 0 ||
    typeof body.id !== "string" ||
    !/^[-\w]{12,80}$/.test(body.id) ||
    (body.undoOf !== undefined && (typeof body.undoOf !== "string" || !/^[-\w]{12,80}$/.test(body.undoOf) || body.undoOf === body.id)) ||
    (body.undoOf !== undefined && body.undoBase !== null && (typeof body.undoBase !== "string" || !/^[-\w]{12,80}$/.test(body.undoBase))) ||
    !Array.isArray(body.operations) ||
    body.operations.length < 1 ||
    body.operations.length > 100
  )
    return null;
  const operations: LibraryOperation[] = [];
  for (const op of body.operations) {
    if(op?.type==="manga-progress"){const manga=cleanManga(op.manga);if(!manga||(op.fields!==null&&!validMangaFields(op.fields)))return null;operations.push({type:"manga-progress",manga,fields:op.fields});continue;}
    if(op?.type === "collection") {
      if(!collectionId(op.id)||!["create","rename","delete"].includes(op.action)||(op.action!=="delete"&&!collectionName(op.name)))return null;
      operations.push({type:"collection",id:op.id,action:op.action,...(op.action!=="delete"?{name:op.name.trim()}:{})});continue;
    }
    if(op?.type === "collection-member") {
      if(!collectionId(op.id)||typeof op.key!=="string"||!/^[-\w:]{1,150}$/.test(op.key)||["__proto__","prototype","constructor"].includes(op.key)||typeof op.value!=="boolean")return null;
      operations.push({type:"collection-member",id:op.id,key:op.key,value:op.value});continue;
    }

    if(op?.type==="person-follow"){
      const person=cleanFollowPerson(op.person);
      if(!person||typeof op.value!=="boolean"||!Number.isSafeInteger(op.at)||op.at<1||op.at>Date.now()+60000)return null;
      operations.push({type:"person-follow",person,value:op.value,at:op.at});continue;
    }
    if(op?.type==="person-preferences"){
      if(!Number.isSafeInteger(op.id)||op.id<1||op.id>2147483647||!validPersonPreferences(op.fields)||!Number.isSafeInteger(op.at)||op.at<1||op.at>Date.now()+60000)return null;
      operations.push({type:"person-preferences",id:op.id,fields:op.fields,at:op.at});continue;
    }
    if (op?.type === "filter-preset") {
      if (typeof op.id !== "string" || !/^[a-f\d-]{36}$/i.test(op.id)) return null;
      const value = op.value === null ? null : cleanPreset(op.value);
      if (op.value !== null && (!value || value.id !== op.id)) return null;
      operations.push({ type: "filter-preset", id: op.id, value }); continue;
    }
    if (op?.type === "recommendation-mode") {
      if (!isRecommendationMode(op.value)) return null;
      operations.push({ type: "recommendation-mode", value: op.value }); continue;
    }
    if (op?.type === "spoiler-free") {
      if (typeof op.value !== "boolean") return null;
      operations.push({ type: "spoiler-free", value: op.value }); continue;
    }
    if (op?.type === "share-performance") {
      if (typeof op.value !== "boolean") return null;
      operations.push({ type: "share-performance", value: op.value }); continue;
    }
    if (op?.type === "avatar") {
      if (op.value !== null && !validProfilePhoto(op.value)) return null;
      operations.push({ type: "avatar", value: op.value });
      continue;
    }
    if (op?.type === "gaming") {
      if (typeof op.value !== "boolean") return null;
      operations.push({ type: "gaming", value: op.value });
      continue;
    }
    if (op?.type === "game-platform") {
      if (!isGamePlatform(op.key) || typeof op.value !== "boolean") return null;
      operations.push({ type: "game-platform", key: op.key, value: op.value });
      continue;
    }
    if (op?.type === "game-status") {
      if (!isGameId(op.id) || (op.value !== null && !isGameStatus(op.value))) return null;
      const game = op.game === undefined ? undefined : cleanGameSnapshot(op.game);
      if (op.game !== undefined && (!game || game.id !== op.id)) return null;
      operations.push({ type: "game-status", id: op.id, value: op.value, ...(game ? { game } : {}) });
      continue;
    }
    if (op?.type === "auto-availability") {
      if (typeof op.value !== "boolean") return null;
      operations.push({ type: "auto-availability", value: op.value });
      continue;
    }
    if (op?.type === "seasonal") {
      if (typeof op.value !== "boolean") return null;
      operations.push({ type: "seasonal", value: op.value });
      continue;
    }
    if (op?.type === "refresh") {
      const title = cleanTitle(op.title);
      if (!title) return null;
      operations.push({ type: "refresh", title });
      continue;
    }
    if (op?.type === "home") {
      const fields = migrateHomePatch(op.fields);
      if (!validHomePatch(fields)) return null;
      operations.push({ type: "home", fields });
      continue;
    }
    if (op?.type === "review") {
      const title = cleanTitle(op.title),
        fields = op.fields;
      if (
        !title ||
        !fields ||
        typeof fields !== "object" ||
        Array.isArray(fields) ||
        !Object.keys(fields).length
      )
        return null;
      for (const key of Object.keys(fields)) {
        if (key === "rating") {
          if (
            fields.rating !== null &&
            (!Number.isInteger(fields.rating) || fields.rating < 1 || fields.rating > 5)
          )
            return null;
        } else if (key === "note") {
          if (typeof fields.note !== "string" || fields.note.length > 2000) return null;
        } else return null;
      }
      operations.push({ type: "review", title, fields });
      continue;
    }
    if (op?.type === "onboard") {
      if (op.value !== true) return null;
      operations.push({ type: "onboard", value: true });
      continue;
    }
    if (op?.type === "episode" || op?.type === "tracking") {
      const title = cleanTitle(op.title);
      if (!title || title.kind !== "series" || !title.tmdbId || typeof op.value !== "boolean") return null;
      if (op.type === "tracking") {
        operations.push({ type: "tracking", title, value: op.value });
        continue;
      }
      if (
        !Number.isInteger(op.season) ||
        op.season < 0 ||
        op.season > 1000 ||
        !Array.isArray(op.episodes) ||
        !op.episodes.length ||
        op.episodes.length > 250 ||
        !op.episodes.every(validEpisodeNumber)
      )
        return null;
      operations.push({
        type: "episode",
        title,
        season: op.season,
        episodes: [...new Set<number>(op.episodes)],
        value: op.value,
      });
      continue;
    }
    if (op?.type === "theme") {
      if (!isTheme(op.value)) return null;
      operations.push({ type: "theme", value: op.value });
      continue;
    }
    if (op?.type === "service" && services.some((s) => s.key === op.key) && typeof op.value === "boolean") {
      operations.push({ type: "service", key: op.key, value: op.value, import: op.import === true });
      continue;
    }
    if (op?.type !== "title" || !op.fields || typeof op.fields !== "object") return null;
    const title = cleanTitle(op.title);
    if (!title) return null;
    const fields: Partial<Record<"saved" | "watched" | "liked" | "hidden", boolean>> = {};
    for (const key of Object.keys(op.fields)) {
      if (!["saved", "watched", "liked", "hidden"].includes(key) || typeof op.fields[key] !== "boolean")
        return null;
      fields[key as keyof typeof fields] = op.fields[key];
    }
    if (!Object.keys(fields).length) return null;
    operations.push({ type: "title", title, fields, import: op.import === true });
  }
  return { revision: body.revision, mutation: { id: body.id, operations, ...(body.undoOf ? { undoOf: body.undoOf, undoBase: body.undoBase } : {}) } };
}

export function setupOperations(selected: string[], theme: ThemeId, gaming: boolean): LibraryOperation[] {
  return [
    ...services.map((s) => ({ type: "service" as const, key: s.key, value: selected.includes(s.key) })),
    { type: "theme", value: theme },
    { type: "gaming", value: gaming },
    { type: "onboard", value: true },
  ];
}
