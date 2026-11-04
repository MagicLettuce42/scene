import { requireSceneMember } from "../../../lib/auth/server";
import { searchCatalogue } from "../../../lib/server-catalogue";
export async function GET(req: Request) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  const started = performance.now();
  const p = new URL(req.url).searchParams, q = (p.get("q") || "").trim(), rawPage = p.get("page") || "1";
  if (!/^\d{1,3}$/.test(rawPage) || Number(rawPage) < 1 || Number(rawPage) > 500)
    return Response.json({ error: "Choose a valid search page." }, { status: 400 });
  const page = Number(rawPage);
  if (q.length < 2 || q.length > 100)
    return Response.json(
      { error: "Enter a title or person’s name between 2 and 100 characters." },
      { status: 400 },
    );
  if (p.get("stream") === "1") {
    const abort = new AbortController(), encoder = new TextEncoder();
    const cancelled = () => abort.abort();
    req.signal.addEventListener("abort", cancelled, { once: true });
    if (req.signal.aborted) abort.abort();
    const stream = new ReadableStream({
      start(controller) {
        const emit = (value: unknown) => { if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(value) + "\n")); };
        void (async () => {
          try {
            emit({ type: "start", page });
            const result = await searchCatalogue(q, page, { signal: abort.signal,
              onTitle: (title, index) => emit({ type: "title", title, index }) });
            emit({ type: "complete", result });
          } catch {
            emit({ type: "error", message: "Search could not finish checking availability. Results already checked are shown. Try again." });
          } finally {
            req.signal.removeEventListener("abort", cancelled);
            if (!abort.signal.aborted) controller.close();
          }
        })();
      },
      cancel() { abort.abort(); req.signal.removeEventListener("abort", cancelled); },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform" } });
  }
  try {
  const catalogue = await searchCatalogue(q, page, { preview: p.get("suggest") === "1", signal: req.signal });
  return Response.json({ people: [], peopleHasMore: false, peopleMessage: null, ...catalogue, page, hasMore: "hasMore" in catalogue && catalogue.hasMore === true },
    { headers: { "Cache-Control": "private, max-age=300", "Server-Timing": `search;dur=${Math.round(performance.now() - started)}` } });
  } catch { return Response.json({ error: "More search results could not load. Please retry." }, { status: 503 }); }
}
