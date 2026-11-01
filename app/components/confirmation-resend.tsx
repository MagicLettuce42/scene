"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Mail } from "lucide-react";
import { getSceneClient } from "../../lib/auth/client";
import { resendSceneConfirmation, validRegistrationEmail } from "../../lib/auth/registration";

export default function ConfirmationResend({ email, onEmailChange, recentlySent = false }: {
  email: string;
  onEmailChange?: (email: string) => void;
  recentlySent?: boolean;
}) {
  const [sending, setSending] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [retryAt, setRetryAt] = useState(() => recentlySent ? Date.now() + 60_000 : 0),
    [remaining, setRemaining] = useState(recentlySent ? 60 : 0);
  const inFlight = useRef(false), nextAttempt = useRef(retryAt);

  useEffect(() => {
    const secondsLeft = () => Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
    setRemaining(secondsLeft());
    if (retryAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const seconds = secondsLeft();
      setRemaining(seconds);
      if (!seconds) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  async function resend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || Date.now() < nextAttempt.current) return;
    if (!validRegistrationEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }
    inFlight.current = true;
    setSending(true);
    setNotice("");
    setError("");
    nextAttempt.current = Date.now() + 60_000;
    setRetryAt(nextAttempt.current);
    setRemaining(60);
    try {
      const client = await getSceneClient();
      await resendSceneConfirmation(client, email, location.origin);
      setNotice("If this address has an unconfirmed Scene account, a new confirmation email will arrive shortly. Check your junk folder too.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Another confirmation email could not be requested. Please try again later.");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }

  return (
    <form className="account-form confirmation-resend" aria-label="Resend confirmation email" aria-busy={sending} onSubmit={resend}>
      {onEmailChange && (
        <label>
          Email address
          <input type="email" autoComplete="email" value={email} required maxLength={254} disabled={sending}
            onChange={(event) => { setNotice(""); setError(""); onEmailChange(event.target.value); }} />
        </label>
      )}
      <button className="button secondary" type="submit" disabled={sending || remaining > 0}>
        {sending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <Mail size={16} aria-hidden="true" />}
        {sending ? "Sending…" : remaining > 0 ? `Resend available in ${remaining}s` : "Resend confirmation email"}
      </button>
      {notice && <p className="fine-print" role="status">{notice}</p>}
      {error && <p className="error-notice" role="alert">{error}</p>}
    </form>
  );
}
