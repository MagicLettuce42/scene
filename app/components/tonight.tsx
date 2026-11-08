"use client";
import SelectControl from "./select-control";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Shuffle, LoaderCircle } from "lucide-react";
import { cachedJSON } from "../../lib/client-cache";
import { moods, chooseThree, tonightCandidates } from "../../lib/tonight";
import { type Title } from "../../lib/catalogue";
import { TitleCard, type CardActions } from "./catalogue-cards";
type Data = { titles: Title[]; hasMore: boolean; message: string | null };
export default function Tonight({ featured = false, onMovieNight, ...actions }: CardActions & {featured?: boolean; onMovieNight?: () => void}) {
  const [open, setOpen] = useState(false),
    [mood, setMood] = useState("any"),
    [kind, setKind] = useState("movie"),
    [minutes, setMinutes] = useState(120);
  const [state, setState] = useState<{ key: string; page: number; data: Data | null }>({
      key: "",
      page: 0,
      data: null,
    }),
    [choices, setChoices] = useState<Title[]>([]),
    [seen, setSeen] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [chosen, setChosen] = useState("");
  const controller = useRef<AbortController | null>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const key = new URLSearchParams({
    mood,
    kind,
    minutes: String(minutes),
    services: [...actions.selected].sort().join(","),
    offer: actions.offer,
  }).toString();
  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setError("");
    setChoices([]);
    setSeen([]);
    setChosen("");
    setState({ key: "", page: 0, data: null });
  }, [key]);
  useEffect(() => () => controller.current?.abort(), []);
  const visible = tonightCandidates(choices, actions.feedback, minutes),
    pool = tonightCandidates(state.key === key ? state.data?.titles || [] : [], actions.feedback, minutes);
  const activeChoice = visible.some((t) => t.id === chosen) ? chosen : "";
  async function suggest() {
    setChosen("");
    setError("");
    const local = chooseThree(pool, seen);
    if (local.length) {
      setChoices(local);
      setSeen((old) => [...old, ...local.map((t) => t.id)]);
      return;
    }
    if (state.key === key && state.data && !state.data.hasMore) {
      const again = chooseThree(pool);
      setChoices(again);
      setSeen(again.map((t) => t.id));
      return;
    }
    const abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    setBusy(true);
    const page = state.key === key ? state.page + 1 : 1;
    try {
      const data = await cachedJSON<Data>(
        "/api/tonight?" + key + "&page=" + page,
        abort.signal,
        Boolean(error),
      );
      if (abort.signal.aborted) return;
      const next = chooseThree(tonightCandidates(data.titles, actions.feedback, minutes));
      setState({ key, page, data });
      setChoices(next);
      setSeen(next.map((t) => t.id));
      heading.current?.focus({ preventScroll: true });
    } catch (e) {
      if (!abort.signal.aborted)
        setError((e as Error).message || "Suggestions could not load. Please try again.");
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className={`tonight ${featured ? "tonight-featured" : ""}`} aria-label="Watch tonight">
      <button
        className="tonight-toggle disclosure-trigger"
        aria-expanded={open}
        aria-controls="tonight-panel"
        onClick={() => setOpen(!open)}
      >
        <span>
          <Sparkles size={18} />
          <strong>{featured ? "Pick something tonight" : "What should I watch tonight?"}</strong>
        </span>

      </button>
      {featured && <div className="tonight-intro"><p>Tell us your mood and how much time you have. We’ll narrow it down to three.</p>{onMovieNight && <button className="text-button" onClick={onMovieNight}>Watching together? Start a Movie Night →</button>}</div>}
      {open && (
        <div id="tonight-panel" className="tonight-panel">
          <p className="fine-print">
            Three choices from your services. Watched and hidden titles are left out.
          </p>
          <div className="tonight-controls">
            <label>
              I feel like
              <SelectControl value={mood} onChange={(e) => setMood(e.target.value)}>
                {moods.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </SelectControl>
            </label>
            <label>
              Something to watch
              <SelectControl value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="movie">A film</option>
                <option value="tv">An episode</option>
              </SelectControl>
            </label>
            <label>
              Time available
              <SelectControl value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                <option value="30">Up to 30 minutes</option>
                <option value="60">Up to an hour</option>
                <option value="90">Up to 90 minutes</option>
                <option value="120">Up to 2 hours</option>
                <option value="180">Up to 3 hours</option>
                <option value="0">No time limit</option>
              </SelectControl>
            </label>
          </div>
          {kind === "tv" && (
            <p className="fine-print">
              Series use the listed typical episode length; individual episodes may be longer.
            </p>
          )}
          <div className="tonight-buttons">
            <button className="button primary" disabled={busy || !actions.selected.length} onClick={suggest}>
              {busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{" "}
              {busy ? "Finding your picks…" : state.data ? "Show other choices" : "Find my three"}
            </button>
            {visible.length > 1 && (
              <button
                className="button secondary"
                onClick={() => setChosen(visible[Math.floor(Math.random() * visible.length)].id)}
              >
                <Shuffle size={17} /> Pick one for me
              </button>
            )}
          </div>
          {error && (
            <p className="error-notice" role="alert">
              {error}
            </p>
          )}
          {state.key === key && state.data && !busy && (
            <>
              <h3 ref={heading} tabIndex={-1} className="tonight-result" aria-live="polite">
                {activeChoice
                  ? "Your pick for tonight"
                  : visible.length
                    ? `${visible.length} ${visible.length === 1 ? "choice" : "choices"} for tonight`
                    : "No new matches in this batch"}
              </h3>
              {visible.length ? (
                <div className="tonight-grid">
                  {(activeChoice ? visible.filter((t) => t.id === activeChoice) : visible).map((t) => (
                    <TitleCard key={t.id} title={t} {...actions} />
                  ))}
                </div>
              ) : (
                <p className="fine-print">
                  {state.data.hasMore
                    ? "Try the next batch with Show other choices, or change the mood or time limit."
                    : "Try another mood or a longer time limit."}
                </p>
              )}
              {activeChoice && (
                <button className="text-button" onClick={() => setChosen("")}>
                  Back to the three choices
                </button>
              )}
              {state.data.message && <p className="fine-print">{state.data.message}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
