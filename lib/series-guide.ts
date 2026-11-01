import { episodeWatched, type EpisodeCatalogue, type SeriesProgress } from "./episodes";

const statuses: Record<string, string> = {
  "Returning Series": "Returning series", Ended: "Ended", Canceled: "Cancelled",
  "In Production": "In production", Planned: "Planned", Pilot: "Pilot",
};
export function seriesStatus(status: string) { return Object.prototype.hasOwnProperty.call(statuses, status) ? statuses[status] : "Status not listed"; }
export function durationLabel(minutes: number) {
  const total = Math.max(0, Math.round(minutes)), hours = Math.floor(total / 60), rest = total % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${rest}m`;
}
export function seriesGuide(catalogue: EpisodeCatalogue, progress?: SeriesProgress, fallbackRuntime?: number | null) {
  const seasons = catalogue.seasons.filter(s => s.number > 0);
  const countComplete = seasons.length > 0 && seasons.every(s => Number.isInteger(s.episodeCount) && s.episodeCount > 0);
  const episodeCount = seasons.reduce((sum, s) => sum + s.episodeCount, 0);
  const watched = seasons.reduce((sum, s) => sum + Object.keys(progress?.episodes?.[String(s.number)] || {}).filter(n =>
    /^[1-9]\d*$/.test(n) && Number(n) <= s.episodeCount && episodeWatched(progress, s.number, Number(n)),
  ).length, 0);
  const runtime = [catalogue.typicalRuntime, fallbackRuntime].find(n => Number.isInteger(n) && Number(n) > 0 && Number(n) <= 600) || null;
  const remaining = countComplete ? Math.max(0, episodeCount - watched) : null;
  return {
    status: seriesStatus(catalogue.status), seasons: seasons.length, episodeCount, countComplete,
    runtime, watched, remaining, hasProgress: Boolean(progress?.tracking || watched),
    totalMinutes: countComplete && runtime ? episodeCount * runtime : null,
    remainingMinutes: remaining !== null && (remaining === 0 || runtime) ? remaining * (runtime || 0) : null,
  };
}
