"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Users,
  Plus,
  ThumbsUp,
  RefreshCw,
  Copy,
  Check,
  Archive,
  Shuffle,
  X,
} from "lucide-react";
import { type Title } from "../../lib/catalogue";
import {
  type SharedList,
  type SharedDetail,
  type SharedInvitation,
  rankSharedItems,
  newId,
} from "../../lib/shared-lists";
import { sharedRequest } from "../../lib/use-shared-lists";
import MovieNight from "./movie-night";
import { Poster } from "./catalogue-cards";
export default function SharedWatchlists({
  accountId,
  onOpen,
  inviteToken,
  onDismissInvite,
}: {
  accountId: string;
  onOpen: (title: Title) => void;
  inviteToken: string;
  onDismissInvite: () => void;
}) {
  const [lists, setLists] = useState<SharedList[] | null>(null),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<SharedDetail | null>(null),
    [name, setName] = useState(""),
    [rename, setRename] = useState(""),
    [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [refresh, setRefresh] = useState(0),
    [showArchived, setShowArchived] = useState(false),
    [confirm, setConfirm] = useState("");
  const [invitation, setInvitation] = useState<SharedInvitation | null>(null),
    [inviteError, setInviteError] = useState(""),
    [link, setLink] = useState(""),
    [copied, setCopied] = useState(false),
    [manage, setManage] = useState(false);
  const createId = useRef(""),
    busyRef = useRef(false);
  busyRef.current = busy;
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError("");
    Promise.all([
      sharedRequest<{ lists: SharedList[] }>(undefined, undefined, ac.signal),
      selected ? sharedRequest<SharedDetail>(undefined, selected, ac.signal) : Promise.resolve(null),
    ])
      .then(([a, b]) => {
        if (ac.signal.aborted) return;
        setLists(a.lists);
        setDetail(b);
        if (b) setRename(b.name);
      })
      .catch((e) => {
        if (!ac.signal.aborted) {
          setError(e.message);
          setDetail(null);
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [selected, refresh]);
  useEffect(() => {
    const resume = () => {
      if (!busyRef.current && document.visibilityState === "visible") setRefresh((n) => n + 1);
    };
    const timer = setInterval(resume, 60000);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
    };
  }, []);
  useEffect(() => {
    setInvitation(null);
    setInviteError("");
    if (!inviteToken) return;
    const ac = new AbortController();
    sharedRequest<SharedInvitation>({ action: "inspect", token: inviteToken }, undefined, ac.signal)
      .then((d) => setInvitation(d))
      .catch((e) => {
        if (!ac.signal.aborted) setInviteError(e.message);
      });
    return () => ac.abort();
  }, [inviteToken]);
  function choose(id: string) {
    setSelected(id);
    setDetail(null);
    setLink("");
    setMessage("");
    setConfirm("");
    setManage(false);
  }
  async function mutate(body: Record<string, unknown>, success: string, after?: (data: any) => void) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = await sharedRequest<any>(body);
      after?.(data);
      setConfirm("");
      setMessage(success);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function create(e: React.FormEvent) {
    e.preventDefault();
    if (!createId.current) createId.current = newId();
    void mutate(
      { action: "create", name, id: createId.current },
      "List created. Add titles from a title’s details.",
      (d) => {
        createId.current = "";
        setName("");
        choose(d.id);
      },
    );
  }
  function invite(e: React.FormEvent) {
    e.preventDefault();
    setLink("");
    setCopied(false);
    void mutate({ action: "invite", listId: selected, email }, "Invitation ready to share.", (d) => {
      setLink(d.url);
      setEmail("");
    });
  }
  const active = detail?.id === selected ? detail : null,
    owner = active?.ownerId === accountId,
    items = rankSharedItems(active?.items || []);
  const visibleLists = (lists || []).filter((l) => l.archived === showArchived);
  return (
    <section className="shared-lists" aria-label="Shared watchlists">
      {inviteToken && (
        <div className="shared-invitation">
          <Users size={22} />
          <div>
            <h3>
              {invitation
                ? invitation.joined
                  ? "You’re already in this list"
                  : `Join “${invitation.name}”?`
                : "Your shared-list invitation"}
            </h3>
            {invitation && (
              <p>
                {invitation.owner ? `${invitation.owner} invited you. ` : ""}People in this list can see your
                name, the titles you add and the vote totals. Your personal watchlist and episode history stay
                private.
              </p>
            )}
            {!invitation && !inviteError && <p role="status">Checking the invitation…</p>}
            {inviteError && <p role="alert">{inviteError} Sign in with the Scene email that was invited.</p>}
            <div className="inline-actions">
              {invitation && (
                <button
                  className="button primary"
                  disabled={busy || loading}
                  onClick={() =>
                    invitation.joined
                      ? (choose(invitation.id), onDismissInvite())
                      : void mutate({ action: "join", token: inviteToken }, "You joined the list.", (d) => {
                          choose(d.id);
                          onDismissInvite();
                        })
                  }
                >
                  {invitation.joined ? "Open list" : "Accept invitation"} <ArrowRight size={16} />
                </button>
              )}
              <button className="text-button" disabled={busy || loading} onClick={onDismissInvite}>
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="shared-toolbar">
        {selected ? (
          <button className="text-button" disabled={busy || loading} onClick={() => choose("")}>
            <ArrowLeft size={16} /> All shared lists
          </button>
        ) : (
          <p className="fine-print">Make a shortlist together. Only invited people can join.</p>
        )}
        <button
          className="icon-button"
          aria-label="Refresh shared lists"
          disabled={busy || loading}
          onClick={() => setRefresh((n) => n + 1)}
        >
          <RefreshCw size={17} className={loading ? "spin" : ""} />
        </button>
      </div>
      {error && (
        <div className="error-notice" role="alert">
          {error}
          <button disabled={busy || loading} onClick={() => setRefresh((n) => n + 1)}>
            Retry
          </button>
        </div>
      )}
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      {!selected ? (
        <>
          <details className="shared-create-disclosure"><summary><Plus size={16} aria-hidden="true"/>New shared list</summary>
          <form className="shared-create stack-form" onSubmit={create}>
            <label>
              New shared list
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  createId.current = "";
                }}
                required
                maxLength={80}
                placeholder="Friday film night"
              />
            </label>
            <button className="button primary" disabled={busy || !name.trim()}>
              <Plus size={17} /> Create list
            </button>
          </form></details>
          <div className="inline-actions">
            <button
              className="text-button"
              aria-pressed={!showArchived}
              onClick={() => setShowArchived(false)}
            >
              Active lists
            </button>
            <button className="text-button" aria-pressed={showArchived} onClick={() => setShowArchived(true)}>
              <Archive size={15} /> Archived
            </button>
          </div>
          {!lists && loading ? (
            <p role="status">Loading shared lists…</p>
          ) : visibleLists.length ? (
            <div className="shared-list-grid">
              {visibleLists.map((l) => (
                <article className="shared-list-card" key={l.id}>
                  <Users size={25} />
                  <h3>{l.name}</h3>
                  <p>
                    {l.count} titles · {l.members} {l.members === 1 ? "person" : "people"}
                    {l.ownerId === accountId ? " · You own this list" : ""}
                  </p>
                  {l.archived ? (
                    <button
                      className="button secondary"
                      disabled={busy || loading}
                      onClick={() =>
                        void mutate({ action: "archive", listId: l.id, value: false }, "List restored.")
                      }
                    >
                      Restore list
                    </button>
                  ) : (
                    <button
                      className="button secondary"
                      disabled={busy || loading}
                      onClick={() => choose(l.id)}
                    >
                      Open list <ArrowRight size={16} />
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="quiet-empty">
              <Users size={28} />
              <h3>{showArchived ? "No archived lists" : "Your next film night starts here"}</h3>
              <p>
                {showArchived
                  ? "Lists you archive can be restored here."
                  : "Create a list, then open any film or series and choose “Add to a shared list”. Invite people when you’re ready."}
              </p>
            </div>
          )}
        </>
      ) : active ? (
        <>
          <MovieNight key={active.id} listId={active.id} accountId={accountId} onOpen={onOpen}
            onAdd={async (title) => {
              await sharedRequest({ action: "add", listId: active.id, title });
              setRefresh(n => n + 1);
            }} />
          <div className="shared-detail-heading">
            <div>
              <p className="eyebrow">WATCH TOGETHER · {active.people.length} PEOPLE</p>
              <h3>{active.name}</h3>
              <p className="fine-print">
                {active.people.map((p) => (p.id === accountId ? "You" : p.name)).join(", ")}
              </p>
            </div>
            <button className="button secondary" aria-expanded={manage} onClick={() => setManage((v) => !v)}>
              <Users size={16} />
              {owner ? "People & settings" : "People"}
            </button>
          </div>
          {manage && (
            <section className="shared-settings">
              <h4>People in this list</h4>
              {active.people.map((p) => (
                <div className="access-row" key={p.id}>
                  <span>
                    {p.id === accountId ? "You" : p.name}
                    {p.id === active.ownerId ? " · List owner" : ""}
                  </span>
                  {owner &&
                    p.id !== accountId &&
                    (confirm === p.id ? (
                      <div>
                        <button
                          disabled={busy || loading}
                          onClick={() =>
                            void mutate(
                              { action: "remove-person", listId: selected, userId: p.id },
                              "Access removed. Their personal library is unchanged.",
                            )
                          }
                        >
                          Confirm removal
                        </button>
                        <button disabled={busy || loading} onClick={() => setConfirm("")}>
                          Keep
                        </button>
                      </div>
                    ) : (
                      <button disabled={busy || loading} onClick={() => setConfirm(p.id)}>
                        Remove
                      </button>
                    ))}
                </div>
              ))}
              {owner ? (
                <>
                  <form onSubmit={invite} className="stack-form">
                    <label>
                      Invite an existing Scene member
                      <input
                        type="email"
                        value={email}
                        maxLength={254}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Their Scene email"
                        required
                      />
                    </label>
                    <button className="button primary" disabled={busy || loading}>
                      <Plus size={16} /> Create invitation
                    </button>
                  </form>
                  <p className="fine-print">
                    The link works only for that account and lasts seven days. Share it yourself. To invite
                    someone new to Scene, use Account first.
                  </p>
                  {link && (
                    <div className="invite-result">
                      <label>
                        Private invitation link
                        <input value={link} readOnly onFocus={(e) => e.target.select()} />
                      </label>
                      <button
                        className="button secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(link);
                            setCopied(true);
                          } catch {
                            setMessage("Select the invitation link and copy it manually.");
                          }
                        }}
                      >
                        {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy link"}
                      </button>
                    </div>
                  )}
                  {active.invites.length > 0 && (
                    <>
                      <h4>Pending invitations</h4>
                      {active.invites.map((i) => (
                        <div className="access-row" key={i.id}>
                          <span>
                            {i.name || "Scene member"}
                            <small>Expires {new Date(i.expiresAt).toLocaleDateString("en-GB")}</small>
                          </span>
                          <button
                            disabled={busy || loading}
                            onClick={() =>
                              void mutate(
                                { action: "cancel-invite", listId: selected, inviteId: i.id },
                                "Invitation cancelled.",
                                () => setLink(""),
                              )
                            }
                          >
                            Cancel
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                  <form
                    className="stack-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void mutate({ action: "rename", listId: selected, name: rename }, "List renamed.");
                    }}
                  >
                    <label>
                      List name
                      <input
                        value={rename}
                        onChange={(e) => setRename(e.target.value)}
                        maxLength={80}
                        required
                      />
                    </label>
                    <button
                      className="button secondary"
                      disabled={busy || !rename.trim() || rename === active.name}
                    >
                      Save name
                    </button>
                  </form>
                  {confirm === "archive" ? (
                    <p className="confirm-action">
                      Archive this list for everyone? You can restore it later.{" "}
                      <button
                        disabled={busy || loading}
                        onClick={() =>
                          void mutate(
                            { action: "archive", listId: selected, value: true },
                            "List archived.",
                            () => choose(""),
                          )
                        }
                      >
                        Archive list
                      </button>
                      <button onClick={() => setConfirm("")}>Cancel</button>
                    </p>
                  ) : (
                    <button className="text-button" onClick={() => setConfirm("archive")}>
                      <Archive size={16} /> Archive list
                    </button>
                  )}
                </>
              ) : confirm === "leave" ? (
                <p className="confirm-action">
                  Leave this list? You’ll need a new invitation to return.{" "}
                  <button
                    disabled={busy || loading}
                    onClick={() =>
                      void mutate({ action: "leave", listId: selected }, "You left the list.", () =>
                        choose(""),
                      )
                    }
                  >
                    Leave list
                  </button>
                  <button onClick={() => setConfirm("")}>Cancel</button>
                </p>
              ) : (
                <button className="text-button" onClick={() => setConfirm("leave")}>
                  Leave this list
                </button>
              )}
            </section>
          )}
          <div className="shared-voting-heading">
            <p className="fine-print">Vote for as many titles as you like. Most votes rise to the top.</p>
            <button
              className="button secondary"
              disabled={!items.length}
              onClick={() => {
                const top = items.filter((i) => i.votes === items[0].votes);
                onOpen(top[Math.floor(Math.random() * top.length)].title);
              }}
            >
              <Shuffle size={16} /> Pick a winner
            </button>
          </div>
          <p className="fine-print">
            Ties are picked at random. Viewing options use your own services when you open a title.
          </p>
          {items.length ? (
            <div className="shared-items">
              {items.map((i) => (
                <article className="shared-item" key={i.key}>
                  <button
                    className="shared-poster"
                    onClick={() => onOpen(i.title)}
                    aria-label={`Open ${i.title.name}`}
                  >
                    <Poster title={i.title} decorative />
                  </button>
                  <div className="shared-item-copy">
                    <button className="shared-title" onClick={() => onOpen(i.title)}>
                      {i.title.name}
                    </button>
                    <p>
                      {i.title.kind === "movie" ? "Film" : "TV series"}
                      {i.title.year ? ` · ${i.title.year}` : ""}
                    </p>
                    <p>
                      Added by{" "}
                      {i.addedBy === accountId
                        ? "you"
                        : active.people.find((p) => p.id === i.addedBy)?.name || "a previous member"}
                    </p>
                    <div className="inline-actions">
                      <button
                        className={`vote-button ${i.voted ? "selected" : ""}`}
                        aria-pressed={i.voted}
                        disabled={busy || loading}
                        onClick={() =>
                          void mutate(
                            { action: "vote", listId: selected, key: i.key, value: !i.voted },
                            i.voted ? "Vote removed." : "Vote saved.",
                          )
                        }
                      >
                        <ThumbsUp size={16} />
                        {i.votes} {i.votes === 1 ? "vote" : "votes"}
                        {i.voted ? " · Yours" : ""}
                      </button>
                      {(owner || i.addedBy === accountId) && (
                        <button
                          className="text-button"
                          disabled={busy || loading}
                          aria-label={`Remove ${i.title.name} from shared list`}
                          onClick={() =>
                            void mutate(
                              { action: "remove-title", listId: selected, key: i.key },
                              "Title removed from this shared list.",
                            )
                          }
                        >
                          <X size={15} /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="quiet-empty">
              <Plus size={28} />
              <h3>Add your first contender</h3>
              <p>Browse films or series, open a title, and choose “Add to a shared list”.</p>
            </div>
          )}
        </>
      ) : loading ? (
        <p role="status">Loading this list…</p>
      ) : null}
    </section>
  );
}
