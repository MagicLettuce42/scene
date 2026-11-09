"use client";
import { useEffect, useRef, useState } from "react";
import { Fingerprint, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { manageScenePasskeys, passkeyMessage, signInWithScenePasskey, supportsPasskeys, type ScenePasskey } from "../../lib/auth/passkeys";

function usePasskeyAvailability() {
  const [status, setStatus] = useState({ loading: true, enabled: false, error: false }), [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setStatus({ loading: true, enabled: false, error: false });
    fetch("/api/auth/passkeys", { cache: "no-store", signal: abort.signal })
      .then(async r => { if (!r.ok) throw Error(); return r.json() as Promise<{ enabled?: unknown }>; })
      .then(data => { if (!abort.signal.aborted) setStatus({ loading: false, enabled: data.enabled === true, error: false }); })
      .catch(() => { if (!abort.signal.aborted) setStatus({ loading: false, enabled: false, error: true }); });
    return () => abort.abort();
  }, [retry]);
  return { ...status, refresh: () => setRetry(n => n + 1) };
}

export function PasskeySignIn({ disabled, captchaToken, onBusy, onSuccess, onError, onFinished }: {
  disabled: boolean; captchaToken?: string; onBusy: (value: boolean) => void;
  onSuccess: () => Promise<void>; onError: (message: string) => void; onFinished: () => void;
}) {
  const availability = usePasskeyAvailability(), abort = useRef<AbortController | null>(null), running = useRef(false);
  useEffect(() => () => abort.current?.abort(), []);
  async function signIn() {
    if (disabled || running.current) return;
    running.current = true;
    const controller = new AbortController(); abort.current = controller;
    onBusy(true); onError("");
    try {
      await signInWithScenePasskey(controller.signal, captchaToken);
      if (!controller.signal.aborted) await onSuccess();
    } catch (error) { if (!controller.signal.aborted) onError(passkeyMessage(error, "signin")); }
    finally { running.current = false; onBusy(false); onFinished(); }
  }
  if (!availability.enabled || !supportsPasskeys()) return null;
  return <div className="passkey-signin"><button type="button" className="button secondary" disabled={disabled} onClick={() => void signIn()}><Fingerprint size={20} />Sign in with a passkey</button><p className="fine-print">Use Face ID, Touch ID or your device screen lock. Set up your first passkey in Security &amp; sessions after signing in.</p></div>;
}

function PasskeyRow({ passkey, disabled, onRename, onRemove }: { passkey: ScenePasskey; disabled: boolean; onRename: (name: string) => void; onRemove: () => void }) {
  const [name, setName] = useState(passkey.friendly_name || "My passkey"), [editing, setEditing] = useState(false), [removing, setRemoving] = useState(false);
  useEffect(() => setName(passkey.friendly_name || "My passkey"), [passkey.friendly_name]);
  const date = (value: string) => { const at = new Date(value); return Number.isFinite(at.getTime()) ? at.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null; };
  return <li className="passkey-row"><div><strong>{passkey.friendly_name || "My passkey"}</strong><p className="fine-print">Added {date(passkey.created_at) || "previously"}{passkey.last_used_at && date(passkey.last_used_at) ? ` · Last used ${date(passkey.last_used_at)}` : ""}</p></div>
    {editing ? <form className="passkey-rename" onSubmit={e => { e.preventDefault(); onRename(name); }}><label>Passkey name<input value={name} maxLength={120} required onChange={e => setName(e.target.value)} disabled={disabled} /></label><div className="inline-actions"><button className="button secondary" disabled={disabled || !name.trim()}>Save name</button><button type="button" className="text-button" disabled={disabled} onClick={() => setEditing(false)}>Done</button></div></form> : <div className="inline-actions"><button className="text-button" disabled={disabled} onClick={() => { setEditing(true); setRemoving(false); }}>Rename</button><button className="text-button" disabled={disabled} onClick={() => setRemoving(true)}>Remove</button></div>}
    {removing && <div className="passkey-confirm"><p>Remove “{passkey.friendly_name || "My passkey"}” from Scene? You can still sign in with your password or another registered passkey.</p><div className="inline-actions"><button className="button secondary" disabled={disabled} onClick={onRemove}>Remove this passkey</button><button className="text-button" disabled={disabled} onClick={() => setRemoving(false)}>Cancel</button></div></div>}
  </li>;
}

export default function PasskeySettings({ userId, owner }: { userId: string; owner: boolean }) {
  const availability = usePasskeyAvailability(), [keys, setKeys] = useState<ScenePasskey[]>([]), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const alive = useRef(true), abort = useRef<AbortController | null>(null), running = useRef(false), version = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; version.current++; abort.current?.abort(); }; }, [userId]);
  async function load() {
    const request = ++version.current;
    setLoading(true); setError("");
    try { const result = await manageScenePasskeys(userId, { action: "list" }); if (alive.current && request === version.current) setKeys(result || []); }
    catch (e) { if (alive.current && request === version.current) setError(passkeyMessage(e)); }
    finally { if (alive.current && request === version.current) setLoading(false); }
  }
  useEffect(() => { if (availability.enabled) void load(); else setKeys([]); }, [availability.enabled, userId]);
  async function change(operation: Parameters<typeof manageScenePasskeys>[1]) {
    if (running.current) return;
    running.current = true; setBusy(true); setError(""); setMessage("");
    try {
      await manageScenePasskeys(userId, operation);
      if (!alive.current) return;
      setMessage(operation.action === "register" ? "Passkey added. You can now use it on Scene’s sign-in screen." : operation.action === "remove" ? "Passkey removed from Scene." : "Passkey name saved.");
      await load();
    } catch (e) { if (alive.current) setError(passkeyMessage(e)); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  }
  return <section className="passkey-settings" aria-labelledby="passkey-heading"><h3 id="passkey-heading"><Fingerprint size={22} aria-hidden="true" />Passkeys</h3><p>Sign in with Face ID, Touch ID, Windows Hello or your device screen lock. Your device handles verification; Scene does not receive your fingerprint or face data.</p>
    {availability.loading ? <p role="status">Checking passkey availability…</p> : !availability.enabled ? <><p>{availability.error ? "Passkey availability could not be checked. Password sign-in still works." : "Passkey sign-in has not been activated for Scene yet. Password sign-in still works."}</p>{owner && !availability.error && <div className="passkey-setup"><p>Enable Passkey authentication in Supabase with these values:</p><dl><dt>Display name</dt><dd>Scene</dd><dt>Relying Party ID</dt><dd>scene.leardigital.workers.dev</dd><dt>Allowed origin</dt><dd>https://scene.leardigital.workers.dev</dd></dl><a className="button secondary" href="https://supabase.com/dashboard/project/cqgauurbkmdbxckjdals/auth/passkeys" target="_blank" rel="noopener noreferrer">Open passkey configuration</a></div>}<button className="text-button" onClick={availability.refresh}><RefreshCw size={16} />Check availability again</button></> : <>
      <p className="fine-print">Add a passkey using your device or password manager. Keep your password as a recovery option. Existing authenticator checks still apply when two-factor authentication is enabled.</p>
      {!supportsPasskeys() && <p>This browser cannot create passkeys. Open Scene in a supported browser over HTTPS to add one. You can still manage existing passkeys here.</p>}
      {loading && <p role="status">Loading your passkeys…</p>}
      {!!keys.length && <ul className="passkey-list">{keys.map(key => <PasskeyRow key={key.id} passkey={key} disabled={busy || loading} onRename={name => void change({ action: "rename", id: key.id, name })} onRemove={() => void change({ action: "remove", id: key.id })} />)}</ul>}
      {!keys.length && !loading && !error && <p>No passkeys registered yet.</p>}
      <div className="inline-actions"><button className="button secondary" disabled={busy || loading || !supportsPasskeys()} onClick={() => { const controller = new AbortController(); abort.current = controller; void change({ action: "register", signal: controller.signal }); }}>{busy ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}Add a passkey</button><button className="text-button" disabled={busy || loading} onClick={() => void load()}>Refresh passkeys</button></div>
    </>}
    {message && <p className="success-notice" role="status">{message}</p>}{error && <p className="error-notice" role="alert">{error}</p>}
  </section>;
}
