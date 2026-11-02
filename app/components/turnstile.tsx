"use client";
import { useEffect, useRef, useState } from "react";
type Api = { render: (element: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: Api } }
let script: Promise<Api> | null = null;
function load(): Promise<Api> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (script) return script;
  script = new Promise<Api>((resolve, reject) => {
    const element = document.createElement("script");
    const timer = window.setTimeout(() => { element.remove(); reject(Error("Security check timed out.")); }, 15000);
    element.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    element.async = true;
    element.onload = () => { clearTimeout(timer); window.turnstile ? resolve(window.turnstile) : reject(Error("Security check unavailable.")); };
    element.onerror = () => { clearTimeout(timer); element.remove(); reject(Error("Security check could not load.")); };
    document.head.appendChild(element);
  }).catch(error => { script = null; throw error; });
  return script;
}
export function useTurnstile() {
  const [token, setToken] = useState(""), [key, setKey] = useState<string | null | undefined>(undefined),
    [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 10000);
    fetch("/api/auth/captcha", { cache: "no-store", signal: controller.signal }).then(async r => {
      const data = await r.json() as { siteKey?: unknown };
      if (!r.ok || !(data.siteKey === null || typeof data.siteKey === "string" && data.siteKey.length > 0)) throw Error();
      if (!controller.signal.aborted) { setKey(data.siteKey as string | null); setError(""); }
    }).catch(() => { if (active) setError("Security settings could not load. Please retry."); })
      .finally(() => clearTimeout(timer));
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [attempt]);
  function reset() { setToken(""); setKey(undefined); setError(""); setAttempt(value => value + 1); }
  return { token, ready: !error && (key === null || Boolean(key && token)), reset,
    element: error ? <div role="alert"><p>{error}</p><button type="button" className="text-button" onClick={reset}>Retry security check</button></div>
      : key === undefined ? <p role="status">Loading security check…</p>
      : key ? <Challenge key={`${key}:${attempt}`} siteKey={key} onToken={setToken} /> : null };
}
function Challenge({ siteKey, onToken }: { siteKey: string; onToken: (value: string) => void }) {
  const container = useRef<HTMLDivElement>(null), [error, setError] = useState(""), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let stopped = false, widget: string | undefined, api: Api | undefined;
    onToken(""); setError("");
    load().then(value => {
      if (stopped || !container.current) return;
      api = value;
      widget = value.render(container.current, { sitekey: siteKey, theme: "auto", size: "flexible",
        "response-field": false,
        callback: (token: string) => { if (!stopped) { onToken(token); setError(""); } },
        "expired-callback": () => { if (!stopped) { onToken(""); setError("Security check expired. Please retry."); } },
        "error-callback": () => { if (!stopped) { onToken(""); setError("Security check could not finish. Please retry."); } },
      });
    }).catch(() => { if (!stopped) { onToken(""); setError("Security check could not load. Check your connection and retry."); } });
    return () => { stopped = true; if (widget !== undefined) api?.remove(widget); };
  }, [siteKey, attempt, onToken]);
  return <div className="turnstile-check"><div ref={container} aria-label="Cloudflare security check" />
    {error && <div role="alert"><p>{error}</p><button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>Retry security check</button></div>}</div>;
}
