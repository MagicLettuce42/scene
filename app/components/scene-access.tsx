"use client";
import SceneMotion from "./scene-motion";
import SceneWordmark from "./scene-wordmark";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, LogIn, LockKeyhole, ArrowRight, Eye, EyeOff } from "lucide-react";
import { getSceneClient, sceneFetch, signOutScene } from "../../lib/auth/client";
import { onSessionBoundaryChange } from "../../lib/auth/session-boundary";
import { readSecurity, type SceneSecurity } from "../../lib/auth/security";
import { EnrollTwoFactor, VerifyTwoFactor } from "./two-factor";
import { HalloweenBadge, useHalloween } from "./seasonal";
import { effectiveTheme } from "../../lib/seasonal";
import { defaultTheme } from "../../lib/themes";
import { finishSceneEmailConfirmation, registerScene } from "../../lib/auth/registration";
import ConfirmationResend from "./confirmation-resend";
export type SceneAccount = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "member";
  security: SceneSecurity;
};
const AccountContext = createContext<SceneAccount | null>(null);
export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw Error("Scene account is required");
  return account;
}
export default function SceneAccess({ children, initialMode = "signin" }: {
  children: ReactNode; initialMode?: "signin" | "signup";
}) {
  const halloween = useHalloween();
  const [account, setAccount] = useState<SceneAccount | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [mfa, setMfa] = useState<SceneAccount | null>(null),
    checkVersion = useRef(0);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [name, setName] = useState(""),
    [invite, setInvite] = useState(""),
    [inviteReady, setInviteReady] = useState(false),
    [invitationError, setInvitationError] = useState("");
  const [confirmation, setConfirmation] = useState(""),
    [signupSent, setSignupSent] = useState(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  useEffect(() => {
    const url = new URL(location.href);
    if (url.searchParams.get("account") === "deleted") {
      setAccountDeleted(true);
      url.searchParams.delete("account");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, []);
  const signup = initialMode === "signup" && !invite;
  useEffect(() => {
    if (account && initialMode === "signup" && !invite) location.replace("/");
  }, [account, initialMode, invite]);
  useEffect(() => {
    if (!account || invite) document.documentElement.dataset.theme = effectiveTheme(defaultTheme);
  }, [account, invite, halloween]);
  async function check() {
    const version = ++checkVersion.current;
    try {
      const client = await getSceneClient(),
        {
          data: { session },
        } = await client.auth.getSession();
      if (version !== checkVersion.current) return;
      if (!session) {
        setAccount(null);
        setMfa(null);
        return;
      }
      const r = await sceneFetch("/api/account"),
        data = (await r.json()) as SceneAccount & { error?: string; code?: string };
      if (version !== checkVersion.current) return;
      if (r.ok && readSecurity(data.security)) {
        if (data.security.allowed) {
          setAccount(data);
          setMfa(null);
        } else {
          setAccount(null);
          setMfa(data);
        }
        setError("");
      } else {
        setAccount(null);
        setMfa(null);
        setError(data.error || "Your account security could not be checked. Try again.");
      }
    } catch {
      if (version === checkVersion.current) {
        setAccount(null);
        setMfa(null);
        setError("Scene could not connect. Check your connection and try again.");
      }
    } finally {
      if (version === checkVersion.current) setLoading(false);
    }
  }
  useEffect(() => {
    let active = true,
      unsubscribe: (() => void) | undefined;
    const stopBoundary = onSessionBoundaryChange(() => {
      if (active) {
        checkVersion.current++;
        setAccount(null);
        setMfa(null);
        setLoading(true);
      }
    });
    const token = new URLSearchParams(location.hash.slice(1)).get("invite");
    if (token) {
      setInvite(token);
      history.replaceState(null, "", location.pathname + location.search);
      fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "inspect", token }),
      })
        .then(async (r) => {
          const d = (await r.json()) as { emailRequired?: boolean; error?: string };
          if (!active) return;
          if (!r.ok) throw Error(d.error);
          setInviteReady(true);
        })
        .catch((e) => {
          if (active) setInvitationError(e.message || "This invitation could not load.");
        });
    }
    getSceneClient()
      .then(async (client) => {
        if (!active) return;
        const confirmationError = await finishSceneEmailConfirmation(
          client, location.href, (address) => history.replaceState(null, "", address),
        );
        if (!active) return;
        if (confirmationError) setError(confirmationError);
        const { data } = client.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_OUT") {
            checkVersion.current++;
            setAccount(null);
            setMfa(null);
          }
          setTimeout(() => {
            if (active) void check();
          }, 0);
        });
        unsubscribe = () => data.subscription.unsubscribe();
        void check();
      })
      .catch(() => {
        if (active) {
          setError("Scene accounts are being set up. Please try again shortly.");
          setLoading(false);
        }
      });
    const recheck = () => {
      if (active && document.visibilityState === "visible") void check();
    };
    window.addEventListener("focus", recheck);
    window.addEventListener("scene:session-check", recheck);
    return () => {
      active = false;
      checkVersion.current++;
      unsubscribe?.();
      stopBoundary();
      window.removeEventListener("focus", recheck);
      window.removeEventListener("scene:session-check", recheck);
    };
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const client = await getSceneClient();
      if (signup) {
        const data = await registerScene(client, { name, email, password, confirmation, origin: location.origin });
        setPassword("");
        setConfirmation("");
        if (data.session) await check();
        else setSignupSent(true);
        return;
      }
      if (invite) {
        const r = await fetch("/api/access", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "join", token: invite, name, email: email.trim().toLowerCase(), password }),
          }),
          data = (await r.json()) as { error?: string };
        if (!r.ok) throw Error(data.error || "Your invitation could not be accepted.");
      }
      const { error: signInError } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) throw Error("That email and password did not work. Please try again.");
      setInvite("");
      setPassword("");
      await check();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (account && !invite && initialMode === "signup")
    return <main className="account-page"><p role="status">Opening Scene… <a href="/">Open your library</a></p></main>;
  if (account && !invite)
    return (
      <AccountContext.Provider key={account.id} value={account}>
        {children}
      </AccountContext.Provider>
    );
  if (mfa && !invite)
    return (
      <main className="account-page">
        <div className="account-brand">
          <SceneWordmark />
        </div>
        <section className="account-card mfa-card">
          <p className="eyebrow">ACCOUNT SECURITY</p>
          <h1>{mfa.security.enrolled ? "One more step." : "Protect your owner account."}</h1>
          <p className="account-intro">
            {mfa.security.enrolled
              ? "Confirm it’s you before opening your Scene library."
              : "The owner account manages invitations and access. Set up an authenticator to protect it."}
          </p>
          {mfa.security.enrolled ? (
            <VerifyTwoFactor onVerified={() => void check()} />
          ) : (
            <EnrollTwoFactor onEnabled={() => void check()} />
          )}
          <button className="text-button" onClick={() => void check()}>
            Check account again
          </button>
          <button
            className="text-button"
            onClick={async () => {
              try {
                await signOutScene();
                await check();
              } catch {
                setError("Sign-out could not finish. Try again.");
              }
            }}
          >
            Sign out
          </button>
          {error && (
            <p className="error-notice" role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    );
  return (
    <main className={`account-page ${halloween ? "seasonal-login" : "screening-login"}`}>
      {!halloween && <SceneMotion entrance />}
      <div className="account-brand">
        <SceneWordmark />
      </div>
      <section className="account-card">
        {halloween ? <HalloweenBadge /> : (
          null
        )}

        <h1>{invite ? "Your place on Scene" : signup ? "Create your Scene account." : halloween ? "A good night for a fright." : "Your next great watch."}</h1>
        {accountDeleted && <p className="success-notice" role="status">Your Scene account has been deleted. You are signed out.</p>}
        <p className="account-intro">
          {invite
            ? "Set your Scene password. Your services, watchlist and activity will stay together across your devices."
            : signup
              ? "Your own watchlist, your services and your next great watch. No invitation needed."
            : halloween
              ? "Sign in for your next great watch."
              : "Your services. Your watchlist. All together."}
        </p>
        {loading && !invite ? (
          <p role="status">
            <LoaderCircle className="spin" size={18} /> Checking your account…
          </p>
        ) : (
          <>
            {signup && signupSent ? (
              <div className="signup-confirmation">
                <h2>Check your email</h2>
                <p role="status">Use the confirmation link sent to {email.trim()} to finish creating your account, then sign in to Scene.</p>
                <p className="fine-print">If you already have an account, you can sign in instead. Check your junk folder if the message hasn’t arrived.</p>
                <ConfirmationResend email={email} recentlySent />
                <a className="button primary" href="/">Go to sign in <ArrowRight size={16} /></a>
              </div>
            ) : invitationError ? (
              <div className="error-notice" role="alert">
                {invitationError}
                <button
                  onClick={() => {
                    setInvite("");
                    setInvitationError("");
                  }}
                >
                  Go to sign in
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="account-form">
                {(invite || signup) && (
                  <label>
                    Your name
                    <input
                      autoComplete="name"
                      value={name}
                      maxLength={80}
                      required
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    maxLength={254}
                    required
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                {invite && <p className="fine-print">Enter the email address used for this invitation.</p>}
                <label>
                  {invite || signup ? "Choose a password" : "Password"}
                  <span className="password-field">
                    <input
                      type={showPassword ? "text" : "password"}
                      autoComplete={invite || signup ? "new-password" : "current-password"}
                      value={password}
                      minLength={invite || signup ? 12 : 1}
                      maxLength={128}
                      required
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </span>
                </label>
                {signup && (
                  <label>
                    Confirm password
                    <input type={showPassword ? "text" : "password"} autoComplete="new-password"
                      value={confirmation} minLength={12} maxLength={128} required
                      onChange={(e) => setConfirmation(e.target.value)} />
                  </label>
                )}
                {(invite || signup) && (
                  <p className="fine-print">
                    Use at least 12 characters. {invite ? "This invitation can only be used once." : "We’ll send you an email to confirm your address."}
                  </p>
                )}
                <button className="button primary" disabled={busy || Boolean(invite && !inviteReady)}>
                  {busy ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />}{" "}
                  {busy ? "One moment…" : invite || signup ? "Create my Scene account" : "Sign in"}
                  <ArrowRight size={16} />
                </button>
              </form>
            )}
            {error && (
              <p className="error-notice" role="alert">
                {error}
              </p>
            )}
            {!invite && !signup && <p className="account-help"><a className="text-button" href="/reset-password">Forgot your password?</a></p>}
            <p className="account-help">
              {invite
                ? "Already completed setup?"
                : signup ? "Already have a Scene account?" : "New to Scene?"}{" "}
              {invite && (
                <button className="text-button" onClick={() => setInvite("")}>
                  Sign in instead
                </button>
              )}
              {!invite && <a className="text-button" href={signup ? "/" : "/signup"}>{signup ? "Sign in" : "Create an account"}</a>}
            </p>
            {/* Only useful after something went wrong, so it stays out of the way otherwise. */}
            {error && (
              <button className="text-button" onClick={() => void check()}>
                Check connection again
              </button>
            )}
          </>
        )}
      </section>
      <p className="account-footer">One place to choose. Watch through your streaming provider.</p>
    </main>
  );
}
