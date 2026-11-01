"use client";
import SelectControl from "./select-control";
import { useEffect, useRef, useState } from "react";
import { Users, Plus, Check } from "lucide-react";
import { type Title } from "../../lib/catalogue";
import { type SharedList, newId } from "../../lib/shared-lists";
import { sharedRequest } from "../../lib/use-shared-lists";
export default function ShareTitle({ title, onManage }: { title: Title; onManage: () => void }) {
  const createId = useRef("");
  const [open, setOpen] = useState(false),
    [lists, setLists] = useState<SharedList[] | null>(null),
    [listId, setListId] = useState(""),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    setError("");
    const ac = new AbortController();
    sharedRequest<{ lists: SharedList[] }>(undefined, undefined, ac.signal)
      .then((d) => {
        setLists(d.lists.filter((l) => !l.archived));
      })
      .catch((e) => {
        if (!ac.signal.aborted) setError(e.message);
      });
    return () => ac.abort();
  }, [open, retry]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let id = listId;
      if (!id) {
        if (!createId.current) createId.current = newId();
        const d = await sharedRequest<{ id: string }>({ action: "create", id: createId.current, name });
        createId.current = "";
        id = d.id;
        setListId(id);
        setLists((v) => [...(v || []), { id, name, ownerId: "", archived: false, count: 0, members: 1 }]);
      }
      await sharedRequest({ action: "add", listId: id, title });
      setMessage("Added to your shared list. Your personal watchlist is unchanged.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!title.tmdbId) return null;
  return (
    <section className="share-title">
      <button className="button secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Users size={16} /> Add to a shared list
      </button>
      {open && (
        <div className="share-title-body">
          <p className="fine-print">Only people who join that list can see this title and its votes.</p>
          {lists && (
            <form onSubmit={add} className="stack-form">
              <label>
                Shared list
                <SelectControl
                  value={listId}
                  onChange={(e) => {
                    setListId(e.target.value);
                    setMessage("");
                  }}
                >
                  <option value="">Create a new list</option>
                  {lists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </SelectControl>
              </label>
              {!listId && (
                <label>
                  List name
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      createId.current = "";
                    }}
                    maxLength={80}
                    required
                    placeholder="Friday film night"
                  />
                </label>
              )}
              <button className="button primary" disabled={busy || (!listId && !name.trim())}>
                {message ? <Check size={16} /> : <Plus size={16} />} {busy ? "Saving…" : "Add title"}
              </button>
            </form>
          )}
          {!lists && !error && <p role="status">Loading your lists…</p>}
          {error && (
            <p className="error-notice" role="alert">
              {error}
              <button type="button" disabled={busy} onClick={() => setRetry((n) => n + 1)}>
                Retry loading lists
              </button>
            </p>
          )}
          {message && (
            <p className="success-message" role="status">
              {message}
            </p>
          )}
          <button className="text-button" onClick={onManage}>
            Manage lists & invite people <Users size={15} />
          </button>
        </div>
      )}
    </section>
  );
}
