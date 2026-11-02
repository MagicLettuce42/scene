"use client";
import { useEffect, useRef, useState } from "react";
import { useTurnstile } from "../components/turnstile";
import SceneWordmark from "../components/scene-wordmark";
import { getSceneClient, signOutScene } from "../../lib/auth/client";
import { openPasswordReset, requestPasswordReset, saveResetPassword, passwordResetNeedsMfa, PasswordResetMfaRequired } from "../../lib/auth/password-reset";
import { VerifyTwoFactor } from "../components/two-factor";

export default function ResetPasswordPage() {
  const [phase, setPhase] = useState<"loading" | "request" | "sent" | "verify" | "reset" | "done">("loading");
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const started = useRef(false);
  const captcha = useTurnstile();
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    getSceneClient().then(async client => {
      const verified = await openPasswordReset(client, location.href, address => history.replaceState(null, "", address));
      setPhase(!verified ? "request" : await passwordResetNeedsMfa(client) ? "verify" : "reset");
    })
      .catch(() => { setError("This reset link could not be verified. Request another email and open it in this browser."); setPhase("request"); });
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if ((phase === "request" && !captcha.ready) || busy || (phase !== "request" && phase !== "reset")) return;
    setBusy(true); setError("");
    try {
      const client = await getSceneClient();
      if (phase === "request") {
        await requestPasswordReset(client, email, location.origin, captcha.token);
        setPhase("sent");
      } else {
        await saveResetPassword(client, password, confirmation);
        setPassword(""); setConfirmation(""); setPhase("done");
        // The new password has saved even if the local sign-out cannot finish.
        await signOutScene().catch(() => {});
      }
    } catch (e) {
      if (e instanceof PasswordResetMfaRequired) { setPhase("verify"); setPassword(""); setConfirmation(""); }
      setError(e instanceof Error ? e.message : "Please try again.");
    }
    finally { if (phase === "request") captcha.reset(); setBusy(false); }
  }
  return <main id="main" tabIndex={-1} className="account-page screening-login">
    <div className="account-brand"><SceneWordmark /></div>
    <section className="account-card">
      <h1>{phase === "done" ? "Password updated." : phase === "sent" ? "Check your email." : phase === "verify" ? "Confirm it’s you." : phase === "reset" ? "Choose a new password." : "Reset your password."}</h1>
      {phase === "loading" ? <p role="status">Checking your reset link…</p> : phase === "verify" ? <>
        <p>Your account uses two-factor authentication. Verify your code to continue with the password reset.</p>
        <VerifyTwoFactor onVerified={() => { void (async () => {
          try {
            const client = await getSceneClient();
            if (await passwordResetNeedsMfa(client)) throw new PasswordResetMfaRequired();
            setError(""); setPhase("reset");
          } catch (e) { setError(e instanceof Error ? e.message : "Your code could not be checked. Try again."); }
        })(); }} />
      </> : phase === "sent" ? <p role="status">If an account exists for that email, you’ll receive a reset link. Check your junk folder and open the link in this browser.</p> : phase === "done" ? <p role="status">You can now sign in with your new password.</p> : <form className="account-form" onSubmit={submit}>
        {phase === "request" ? <><label>Email<input type="email" autoComplete="username" value={email} maxLength={254} required onChange={e => setEmail(e.target.value)} /></label><p className="fine-print">Used to send an account recovery link. <a href="/privacy">Privacy Policy</a>.</p></> : <>
          <label>New password<input type="password" autoComplete="new-password" value={password} minLength={12} maxLength={128} required onChange={e => setPassword(e.target.value)} /></label>
          <label>Confirm password<input type="password" autoComplete="new-password" value={confirmation} minLength={12} maxLength={128} required onChange={e => setConfirmation(e.target.value)} /></label>
          <p className="fine-print">Use 12–128 characters. Your authenticator settings stay in place.</p>
        </>}
        {phase === "request" && captcha.element}
        <button className="button primary" disabled={busy || (phase === "request" && !captcha.ready)}>{busy ? "One moment…" : phase === "request" ? "Email me a reset link" : "Save new password"}</button>
      </form>}
      {error && <p className="error-notice" role="alert">{error}</p>}
      <p className="account-help"><a className="text-button" href="/">Back to sign in</a></p>
    </section>
  </main>;
}
