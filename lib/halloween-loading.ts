import type { Title } from "./catalogue";
import { mergeBrowseTitles } from "./browse-loading";

export type HalloweenPage = {
  titles: Title[];
  message: string | null;
  genres: string[];
  page: number;
  hasMore: boolean;
};

export function replaceHalloweenPage(pages: HalloweenPage[], next: HalloweenPage) {
  return [...pages.filter((page) => page.page !== next.page), next].sort((a, b) => a.page - b.page);
}

export function halloweenPageTitles(pages: HalloweenPage[]) {
  return mergeBrowseTitles([], pages.flatMap((page) => page.titles));
}

// Count cards after account preferences and filters, rather than counting raw
// catalogue rows. Duplicate/hidden batches must not leave a short shelf stuck.
export async function loadHalloweenBatches({
  page, previous, signal, force, countVisible, request, onAttempt, onPage,
}: {
  page: number;
  previous: HalloweenPage[];
  signal: AbortSignal;
  force: boolean;
  countVisible: (titles: Title[]) => number;
  request: (page: number, signal: AbortSignal, force: boolean) => Promise<HalloweenPage>;
  onAttempt: (page: number) => void;
  onPage: (pages: HalloweenPage[]) => void;
}) {
  let pages = previous;
  const target = page === 0 ? 24 : countVisible(halloweenPageTitles(previous)) + 12,
    limit = force ? 1 : page === 0 ? 4 : 3;
  for (let offset = 0; offset < limit; offset++) {
    if (signal.aborted) return;
    const current = page + offset;
    onAttempt(current);
    const data = await request(current, signal, force);
    if (signal.aborted) return;
    pages = replaceHalloweenPage(pages, data);
    onPage(pages);
    if (force || !data.hasMore || data.message || countVisible(halloweenPageTitles(pages)) >= target) break;
  }
}
