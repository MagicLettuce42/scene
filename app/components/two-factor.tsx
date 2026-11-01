"use client";
import SelectControl from "./select-control";
import { useEffect, useId, useState } from "react";
import { Check, Copy, LoaderCircle, ShieldCheck } from "lucide-react";
import { getSceneClient } from "../../lib/auth/client";
type Factor = { id: string; friendly_name?: string; status: string; factor_type: string };
type Enrollment = { id: string; qr: string; secret: string };
const tidyCode = (value: string) => value.replace(/\D/g, "").slice(0, 6);
const changed = () => window.dispatchEvent(new Event("scene:session-check"));
async function factors() {
  const client = await getSceneClient(),
    result = await client.auth.mfa.listFactors();
  if (result.error) throw result.error;
  return result.data.all as Factor[];
}
async function verify(factorId: string, code: string) {
  if (!/^\d{6}$/.test(code)) throw Error("Enter the six-digit code from your authenticator.");
  const client = await getSceneClient(),
    result = await client.auth.mfa.challengeAndVerify({ factorId, code });
  if (result.error)
    throw Error(
      result.error.status === 429
        ? "Too many attempts. Wait a moment before trying again."
        : "That code could not be verified. Check your authenticator and try the next code.",
    );
}

export function VerifyTwoFactor({
  onVerified,
  onCancel,
  heading = "Enter your security code",
}: {
  onVerified: () => void;
  onCancel?: () => void;
  heading?: string;
}) {
  const id = useId(),
    [list, setList] = useState<Factor[]>([]),
    [factor, setFactor] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const all = (await factors()).filter((f) => f.status === "verified" && f.factor_type === "totp");
      setList(all);
      setFactor((current) => (all.some((f) => f.id === current) ? current : all[0]?.id || ""));
      if (!all.length) setError("No verified authenticator was found. Check your account again.");
    } catch {
      setError("Your authenticators could not load. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await verify(factor, code);
      setCode("");
      onVerified();
    } catch (e) {
      setError((e as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="two-factor">
      <h3>{heading}</h3>
      <p className="fine-print">Open your authenticator app and enter its current six-digit code.</p>
      {loading ? (
        <p role="status">Loading authenticators…</p>
      ) : (
        <form className="account-form" onSubmit={submit}>
          {list.length > 1 && (
            <label htmlFor={id + "-factor"}>
              Authenticator
              <SelectControl
                id={id + "-factor"}
                value={factor}
                onChange={(e) => {
                  setFactor(e.target.value);
                  setCode("");
                }}
              >
                {list.map((f, i) => (
                  <option key={f.id} value={f.id}>
                    {f.friendly_name || `Authenticator ${i + 1}`}
                  </option>
                ))}
              </SelectControl>
            </label>
          )}
          <label htmlFor={id + "-code"}>
            Security code
            <input
              id={id + "-code"}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(tidyCode(e.target.value))}
              required
              autoFocus
            />
          </label>
          <button className="button primary" disabled={busy || !factor || code.length !== 6}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />} Verify code
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="error-notice">
          {error}
        </p>
      )}
      {!loading && !list.length && (
        <button className="text-button" onClick={load}>
          Try again
        </button>
      )}
      <details className="recovery-help">
        <summary>Lost your authenticator?</summary>
        <p>
          Choose a backup authenticator above if you registered one, or restore it using the setup key you
          saved separately. A password reset will not remove two-factor authentication.
        </p>
        <p>
          If neither is available, contact the Scene owner. Owner accounts need recovery through the Supabase
          project administrator after identity has been checked.
        </p>
      </details>
      {onCancel && (
        <button className="text-button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      )}
    </section>
  );
}

export function EnrollTwoFactor({
  onEnabled,
  onCancel,
  backup = false,
}: {
  onEnabled: () => void;
  onCancel?: () => void;
  backup?: boolean;
}) {
  const id = useId(),
    [name, setName] = useState(backup ? "Backup authenticator" : "My authenticator"),
    [setup, setSetup] = useState<Enrollment | null>(null),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const client = await getSceneClient();
      for (const f of await factors()) {
        if (f.status === "unverified" && f.friendly_name === name.trim()) {
          const removed = await client.auth.mfa.unenroll({ factorId: f.id });
          if (removed.error) throw Error("The unfinished setup could not be restarted. Try again.");
        }
      }
      const r = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: name.trim(),
        issuer: "Scene",
      });
      if (r.error)
        throw Error(
          r.error.code === "mfa_factor_name_conflict"
            ? "Use a different authenticator name."
            : "Setup could not start. Try again or choose a different authenticator name.",
        );
      setSetup({ id: r.data.id, qr: r.data.totp.qr_code, secret: r.data.totp.secret });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function enable(e: React.FormEvent) {
    e.preventDefault();
    if (!setup) return;
    setBusy(true);
    setError("");
    try {
      await verify(setup.id, code);
      setSetup(null);
      setCode("");
      onEnabled();
    } catch (e) {
      setError((e as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    try {
      if (setup) {
        const all = await factors();
        if (all.some((f) => f.id === setup.id && f.status === "unverified")) {
          const r = await (await getSceneClient()).auth.mfa.unenroll({ factorId: setup.id });
          if (r.error) throw r.error;
        }
      }
      setSetup(null);
      onCancel?.();
    } catch {
      setError("This unfinished setup could not be removed. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="two-factor">
      <h3>{backup ? "Add a backup authenticator" : "Set up two-factor authentication"}</h3>
      <p className="fine-print">
        Use an authenticator app such as Apple Passwords, Microsoft Authenticator or Google Authenticator.{" "}
        {backup
          ? "Use a separate device or app for your backup."
          : "Your password and a six-digit code will be needed at sign-in."}
      </p>
      {!setup ? (
        <form className="account-form" onSubmit={start}>
          <label htmlFor={id + "-name"}>
            Authenticator name
            <input
              id={id + "-name"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={40}
            />
          </label>
          <button className="button primary" disabled={busy || !name.trim()}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />} Start setup
          </button>
        </form>
      ) : (
        <>
          <img
            className="mfa-qr"
            src={
              setup.qr.startsWith("data:image/svg+xml")
                ? setup.qr
                : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(setup.qr)
            }
            alt="Scan this QR code with your authenticator app"
          />
          <p className="fine-print">
            On the same phone? Add a verification code in your authenticator and enter this setup key
            manually.
          </p>
          <label className="mfa-secret" htmlFor={id + "-secret"}>
            Setup key
            <input
              id={id + "-secret"}
              value={setup.secret}
              readOnly
              spellCheck={false}
              autoComplete="off"
              onFocus={(e) => e.target.select()}
            />
          </label>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(setup.secret);
                setCopied(true);
              } catch {
                setError("Select the setup key and copy it manually.");
              }
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy setup key"}
          </button>
          <p className="mfa-backup-note">
            Save this key somewhere secure, separate from your authenticator. It can restore access if you
            lose your device. Never share it. You can also add a second authenticator after setup.
          </p>
          <form className="account-form" onSubmit={enable}>
            <label htmlFor={id + "-verify"}>
              Code from your authenticator
              <input
                id={id + "-verify"}
                value={code}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                onChange={(e) => setCode(tidyCode(e.target.value))}
                required
              />
            </label>
            <button className="button primary" disabled={busy || code.length !== 6}>
              {busy ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />} Enable
              authenticator
            </button>
          </form>
          <p className="fine-print">
            Enabling an authenticator signs out your other sessions. Sync any changes on your other devices
            first.
          </p>
        </>
      )}
      {error && (
        <p className="error-notice" role="alert">
          {error}
        </p>
      )}
      {(setup || onCancel) && (
        <button className="text-button" onClick={cancel} disabled={busy}>
          Cancel setup
        </button>
      )}
    </section>
  );
}

export default function AccountSecurity({
  owner,
  pending,
  onChanged,
}: {
  owner: boolean;
  pending: number;
  onChanged: () => void;
}) {
  const [list, setList] = useState<Factor[]>([]),
    [loaded, setLoaded] = useState(false),
    [enrolling, setEnrolling] = useState(false),
    [remove, setRemove] = useState<Factor | null>(null),
    [confirmOthers, setConfirmOthers] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    try {
      setList(await factors());
      setLoaded(true);
    } catch {
      setError("Security settings could not load. Please try again.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const verified = list.filter((f) => f.status === "verified");
  async function refresh() {
    await load();
    onChanged();
    changed();
  }
  async function removeFactor() {
    if (!remove) return;
    setBusy(true);
    setError("");
    try {
      const client = await getSceneClient(),
        current = await factors();
      if (owner && remove.status === "verified" && current.filter((f) => f.status === "verified").length < 2)
        throw Error("Add a backup authenticator before removing your last one.");
      const r = await client.auth.mfa.unenroll({ factorId: remove.id });
      if (r.error) throw Error("This authenticator could not be removed. Verify your code and try again.");
      setRemove(null);
      await client.auth.refreshSession();
      setMessage("Authenticator removed.");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function signOutOthers() {
    setBusy(true);
    setError("");
    try {
      const client = await getSceneClient();
      const { error } = await client.auth.signOut({ scope: "others" });
      if (error) throw error;
      setConfirmOthers(false);
      setMessage("Other sessions have been signed out. This session stays signed in.");
    } catch {
      setError("Other sessions could not be signed out. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="account-security">
      <h3>
        <ShieldCheck size={19} /> Security
      </h3>
      <p>
        {owner
          ? "Two-factor authentication is required for the owner account."
          : "Two-factor authentication is optional. Turn it on for extra protection."}
      </p>
      {!loaded ? (
        <button className="text-button" onClick={load}>
          Load security settings
        </button>
      ) : (
        <>
          <p className="security-status">
            {verified.length ? "Two-factor authentication is on" : "Two-factor authentication is off"}
          </p>
          {verified.length === 1 && (
            <p className="mfa-backup-note">
              Add a backup authenticator on a separate device, or keep your setup key safely stored. This is
              your recovery route if you lose your phone.
            </p>
          )}
          {list.map((f, i) => (
            <div className="access-row" key={f.id}>
              <div>
                <strong>{f.friendly_name || `Authenticator ${i + 1}`}</strong>
                <small>{f.status === "verified" ? "Verified" : "Setup incomplete"}</small>
              </div>
              <button
                disabled={busy || pending > 0 || (owner && f.status === "verified" && verified.length < 2)}
                onClick={() => {
                  setRemove(f);
                  setError("");
                  setEnrolling(false);
                }}
              >
                Remove
              </button>
            </div>
          ))}
          {remove &&
            (remove.status === "verified" ? (
              <VerifyTwoFactor
                heading={
                  verified.length === 1
                    ? "Verify to turn off two-factor authentication"
                    : "Verify to remove this authenticator"
                }
                onVerified={() => void removeFactor()}
                onCancel={() => setRemove(null)}
              />
            ) : (
              <div className="security-confirm">
                <p>Remove this unfinished authenticator setup?</p>
                <button className="button secondary" disabled={busy} onClick={removeFactor}>
                  Remove unfinished setup
                </button>
                <button className="text-button" onClick={() => setRemove(null)}>
                  Keep it
                </button>
              </div>
            ))}
          {enrolling ? (
            <EnrollTwoFactor
              backup={verified.length > 0}
              onEnabled={() => {
                setEnrolling(false);
                setMessage("Authenticator enabled.");
                void refresh();
              }}
              onCancel={() => {
                setEnrolling(false);
                void load();
              }}
            />
          ) : (
            <button
              className="button secondary"
              disabled={busy || pending > 0 || Boolean(remove)}
              onClick={() => setEnrolling(true)}
            >
              {verified.length ? "Add backup authenticator" : "Turn on two-factor authentication"}
            </button>
          )}
        </>
      )}
      {pending > 0 && (
        <p className="fine-print">Let your library finish syncing before changing authenticators.</p>
      )}
      <details className="recovery-help">
        <summary>Recovery and account protection</summary>
        <p>
          A saved setup key or second authenticator lets you sign in if you lose your main device.
          Password-reset invitations keep your authenticators in place. If you lose all recovery options,
          contact the Scene owner; the project administrator must verify your identity before resetting MFA in
          Supabase.
        </p>
        {owner && (
          <p>
            Your Supabase dashboard has its own separate two-factor setting.{" "}
            <a href="https://supabase.com/dashboard/account/security" target="_blank" rel="noreferrer">
              Protect your Supabase account
            </a>
            .
          </p>
        )}
      </details>
      <div className="security-sessions">
        <h4>Other sessions</h4>
        <p className="fine-print">
          Sign out other browsers and devices if one is lost or no longer used. Sync changes first. Unsynced
          changes on those devices may be lost when their local data is cleared.
        </p>
        {confirmOthers ? (
          <div className="security-confirm">
            <button className="button secondary" disabled={busy} onClick={signOutOthers}>
              Confirm sign out of other sessions
            </button>
            <button className="text-button" disabled={busy} onClick={() => setConfirmOthers(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="button secondary" disabled={busy} onClick={() => setConfirmOthers(true)}>
            Sign out other sessions
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="fine-print">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="error-notice">
          {error}
        </p>
      )}
    </section>
  );
}
