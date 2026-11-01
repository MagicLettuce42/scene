import type { Title } from "./catalogue";
export type BrowseResponse = {
  titles: Title[];
  page: number;
  hasMore: boolean;
  capped: boolean;
  genres: string[];
  message: string | null;
};
export function mergeBrowseTitles(previous: Title[], next: Title[]) {
  const seen = new Set<string>();
  return [...previous, ...next].filter((t) => {
    if (seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}
export async function loadBrowseBatches({
  page,
  append,
  key,
  signal,
  force,
  request,
  onAttempt,
  onPage,
}: {
  page: number;
  append: boolean;
  key: string;
  signal: AbortSignal;
  force: boolean;
  request: (url: string, signal: AbortSignal, force: boolean) => Promise<BrowseResponse>;
  onAttempt: (page: number) => void;
  onPage: (data: BrowseResponse, append: boolean) => void;
}) {
  const count = append || page !== 1 ? 1 : 2;
  for (let offset = 0; offset < count; offset++) {
    if (signal.aborted) return;
    const currentPage = page + offset;
    onAttempt(currentPage);
    const data = await request(`/api/browse?${key}&page=${currentPage}`, signal, force);
    if (signal.aborted) return;
    onPage(data, append || offset > 0);
    if (!data.hasMore) break;
  }
}
