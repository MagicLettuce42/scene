"use client";
import SelectControl from "./select-control";
import PersonPortrait from "./person-portrait";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { sceneFetch } from "../../lib/auth/client";
import type { Person, PersonRole, Filmography } from "../../lib/people";
import { TitleCard, type CardActions } from "./catalogue-cards";
import PeopleFollowing, { PersonFollowControls, type PeopleFollowingProps } from "./people-following";
export default function PeopleExplorer({
  initialPerson,
  initialQuery = "",
  initialView = "search",
  following,
  ...actions
}: CardActions & { initialPerson: Person | null; initialQuery?: string; initialView?: "search"|"following"; following?: PeopleFollowingProps }) {
  const [view,setView]=useState<"search"|"following">(initialView);
  const [query, setQuery] = useState(initialQuery),
    [submitted, setSubmitted] = useState(initialQuery),
    [people, setPeople] = useState<Person[]>([]),
    [person, setPerson] = useState<Person | null>(initialPerson),
    [role, setRole] = useState<PersonRole>("all"),
    [page, setPage] = useState(1),
    [data, setData] = useState<Filmography | null>(null),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const generation = useRef(0),
    selected = actions.selected.slice().sort().join(",");
  useEffect(() => {
    if (!person && (!submitted || view==="following")) return;
    const controller = new AbortController(),
      run = ++generation.current;
    setBusy(true);
    setError("");
    const params = person
      ? new URLSearchParams({ person: String(person.id), services: selected, role, page: String(page) })
      : new URLSearchParams({ q: submitted, page: String(page) });
    sceneFetch("/api/people?" + params, { signal: controller.signal })
      .then(async (r) => {
        const d = (await r.json()) as Filmography & {
          people: Person[];
          hasMore: boolean;
          error?: string;
        };
        if (!r.ok) throw Error(d.error);
        return d;
      })
      .then((d) => {
        if (run !== generation.current || controller.signal.aborted) return;
        if (person)
          setData((old) => ({
            ...d,
            titles:
              page === 1
                ? d.titles
                : [
                    ...(old?.titles || []),
                    ...d.titles.filter((t: any) => !old?.titles.some((x) => x.id === t.id)),
                  ],
          }));
        else
          setPeople((old) =>
            page === 1
              ? d.people
              : [...old, ...d.people.filter((p: Person) => !old.some((x) => x.id === p.id))],
          );
        setMore(d.hasMore);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [person?.id, submitted, role, page, selected, retry, view]);
  function choose(p: Person) {
    document.querySelector("dialog[open]")?.scrollTo({ top: 0, behavior: "instant" });
    setPerson(p);
    setPage(1);
    setData(null);
    setMore(false);
    setRole("all");
    setError("");
  }
  return (
    <>
      <p className="eyebrow">FOLLOW YOUR FAVOURITES</p>
      <h2 id="dialog-title">{person ? person.name : "Actors & directors"}</h2>
      {!person&&following&&<div className="segmented-control people-view-tabs" aria-label="People views"><button aria-pressed={view==="search"} onClick={()=>setView("search")}>Find people</button><button aria-pressed={view==="following"} onClick={()=>setView("following")}>Following · {following.follows.length}</button></div>}
      {person ? (
        <>
          <button
            className="text-button"
            onClick={() => {
              setPerson(null);
              setPage(1);
              setData(null);
              setMore(false);
              setError("");
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" /> {view==="following"?"Back to following":"Search people"}
          </button>
          {following&&<PersonFollowControls person={person} follow={following.follows.find(f=>f.person.id===person.id)} onFollow={following.onFollow} onPreferences={following.onPreferences} limitReached={following.follows.length>=20}/>}
          <p className="modal-intro">
            Films and series with confirmed subscription or free viewing on your selected services.
          </p>
          <label className="people-role">
            Credits
            <SelectControl
              value={role}
              onChange={(e) => {
                setRole(e.target.value as PersonRole);
                setPage(1);
                setData(null);
                setMore(false);
              }}
            >
              <option value="all">Acting & directing</option>
              <option value="acting">Acting</option>
              <option value="directing">Directing</option>
            </SelectControl>
          </label>
          {!actions.selected.length && (
            <p className="fine-print">Choose your services in My services to see viewing options here.</p>
          )}
          <div className="poster-grid people-titles">
            {data?.titles.map((t) => (
              <TitleCard key={t.id} title={t} {...actions} />
            ))}
          </div>
          {!busy && !error && !data?.titles.length && (
            <p className="fine-print">
              No titles on your services in this batch.{more ? " Load more credits to keep looking." : ""}
            </p>
          )}
          {data?.message && (
            <p className="fine-print">
              {data.message}{" "}
              <button className="text-button" disabled={busy} onClick={() => setRetry((n) => n + 1)}>
                Retry this batch
              </button>
            </p>
          )}
        </>
      ) : view==="following"&&following ? <PeopleFollowing {...following} onChoose={choose} onSearch={()=>setView("search")} onOpen={actions.onOpen} onSave={actions.onSave} isSaved={actions.isSaved}/> : (
        <>
          <p className="modal-intro">
            Find a favourite actor or director, then explore what you can watch on your services.
          </p>
          <form
            className="people-search"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setPeople([]);
              setMore(false);
              setSubmitted(query.trim());
              setRetry((n) => n + 1);
            }}
          >
            <label htmlFor="people-query">
              Person’s name
              <input
                id="people-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                minLength={2}
                maxLength={100}
                enterKeyHint="search"
                placeholder="e.g. Olivia Colman"
                required
              />
            </label>
            <button className="button primary" disabled={busy || query.trim().length < 2}>
              Search
            </button>
          </form>
          <div className="people-list">
            {people.map((p) => (
              <button key={p.id} className="person-result" onClick={() => choose(p)}>
                <PersonPortrait name={p.name} photo={p.photo} decorative />
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.department}</small>
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            ))}
          </div>
          {submitted && !busy && !error && !people.length && <p>No people found. Try another spelling.</p>}
        </>
      )}
      {(person||view==="search")&&busy && <p role="status">{person ? "Checking viewing options…" : "Searching people…"}</p>}
      {(person||view==="search")&&error && (
        <div className="error-notice" role="alert">
          {error}
          <button className="text-button" onClick={() => setRetry((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {(person||view==="search")&&more && !error && (
        <button className="button secondary" disabled={busy} onClick={() => setPage((n) => n + 1)}>
          {person ? "Load more credits" : "More people"}
        </button>
      )}
    </>
  );
}
