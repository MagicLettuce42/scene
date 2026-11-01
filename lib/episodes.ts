import { londonDate } from "./episode-calendar";
export type Episode = { number: number; name: string; airDate: string | null; runtime: number | null };
export type Season = { number: number; name: string; episodeCount: number; airDate: string | null };
export type SeriesProgress = { tracking: boolean; episodes: Record<string, Record<string, boolean>> };
export type EpisodeCatalogue = { seasons: Season[]; status: string; typicalRuntime?: number | null; season?: number; episodes?: Episode[] };
export const validEpisodeNumber = (n: unknown): n is number =>
  Number.isInteger(n) && Number(n) > 0 && Number(n) <= 10000;
export const episodeWatched = (progress: SeriesProgress | undefined, season: number, episode: number) =>
  progress?.episodes?.[String(season)]?.[String(episode)] === true;
export const episodeReleased = (episode: Episode, today = londonDate()) =>
  !episode.airDate || episode.airDate <= today;
export function firstIncompleteSeason(seasons: Season[], progress?: SeriesProgress) {
  return (
    [...seasons]
      .filter((s) => s.number > 0 && s.episodeCount > 0)
      .sort((a, b) => a.number - b.number)
      .find((s) =>
        Array.from({ length: s.episodeCount }, (_, i) => i + 1).some(
          (n) => !episodeWatched(progress, s.number, n),
        ),
      ) || null
  );
}
export function allEpisodesWatched(seasons: Season[], progress?: SeriesProgress) {
  const regular = seasons.filter((s) => s.number > 0);
  // Missing episode counts are not proof of completion. Specials do not block Next up.
  return (
    regular.length > 0 &&
    regular.every((s) => s.episodeCount > 0) &&
    firstIncompleteSeason(regular, progress) === null
  );
}
export function nextEpisode(episodes: Episode[], season: number, progress?: SeriesProgress) {
  return (
    [...episodes]
      .sort((a, b) => a.number - b.number)
      .find((e) => !episodeWatched(progress, season, e.number)) || null
  );
}
export function normalizeSeasons(data: any): EpisodeCatalogue {
  const seen = new Set<number>();
  const runtimes = (Array.isArray(data.episode_run_time) ? data.episode_run_time : [])
    .filter((n: unknown): n is number => Number.isInteger(n) && Number(n) > 0 && Number(n) <= 600)
    .sort((a: number, b: number) => a - b);
  const recentRuntime = data.last_episode_to_air?.runtime;
  return {
    typicalRuntime: runtimes.length ? runtimes[Math.floor(runtimes.length / 2)] :
      Number.isInteger(recentRuntime) && recentRuntime > 0 && recentRuntime <= 600 ? recentRuntime : null,
    status: typeof data.status === "string" ? data.status : "",
    seasons: (Array.isArray(data.seasons) ? data.seasons : [])
      .filter(
        (s: any) =>
          Number.isInteger(s.season_number) &&
          s.season_number >= 0 &&
          s.season_number <= 1000 &&
          !seen.has(s.season_number) &&
          seen.add(s.season_number),
      )
      .map((s: any) => ({
        number: s.season_number,
        name: typeof s.name === "string" ? s.name.slice(0, 150) : `Season ${s.season_number}`,
        episodeCount: Number.isInteger(s.episode_count) ? Math.max(0, Math.min(10000, s.episode_count)) : 0,
        airDate: date(s.air_date),
      }))
      .sort((a: Season, b: Season) => a.number - b.number),
  };
}
function date(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}
export function normalizeEpisodes(data: any): Episode[] {
  const seen = new Set<number>();
  return (Array.isArray(data.episodes) ? data.episodes : [])
    .filter(
      (e: any) =>
        validEpisodeNumber(e.episode_number) && !seen.has(e.episode_number) && seen.add(e.episode_number),
    )
    .map((e: any) => ({
      number: e.episode_number,
      name: typeof e.name === "string" ? e.name.slice(0, 200) : `Episode ${e.episode_number}`,
      airDate: date(e.air_date),
      runtime: Number.isInteger(e.runtime) && e.runtime > 0 ? e.runtime : null,
    }))
    .sort((a: Episode, b: Episode) => a.number - b.number);
}
