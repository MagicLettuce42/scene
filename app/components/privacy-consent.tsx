"use client";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { consentKey, policyVersion, readPrivacyChoice, type PrivacyChoice } from "../../lib/privacy-consent";

type PrivacyState = { performance: boolean; choose: (performance: boolean) => void; open: () => void };
const PrivacyContext = createContext<PrivacyState>({ performance: false, choose() {}, open() {} });
export const usePrivacyConsent = () => useContext(PrivacyContext);
export default function PrivacyConsent({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<PrivacyChoice | null>(null), [visible, setVisible] = useState(false),
    [storageNotice, setStorageNotice] = useState("");
  const panel = useRef<HTMLElement>(null), trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const read = () => {
      let next: PrivacyChoice | null = null;
      try { next = readPrivacyChoice(localStorage.getItem(consentKey)); } catch {}
      setChoice(next); setVisible(!next);
      if (next?.performance !== true) window.dispatchEvent(new CustomEvent("scene:privacy-choice", { detail: { performance: false } }));
    };
    read();
    const changed = (event: StorageEvent) => { if (event.key === consentKey || event.key === null) read(); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  function choose(performance: boolean) {
    const next: PrivacyChoice = { version: policyVersion, performance, savedAt: Date.now() };
    try { localStorage.setItem(consentKey, JSON.stringify(next)); setStorageNotice(""); }
    catch { setStorageNotice("Your browser could not remember this choice. It applies for this visit."); }
    setChoice(next); setVisible(false);
    // Stop queued optional measurements synchronously, before React's cleanup.
    window.dispatchEvent(new CustomEvent("scene:privacy-choice", { detail: { performance } }));
    if (panel.current?.contains(document.activeElement)) (trigger.current || document.getElementById("main"))?.focus();
  }
  function open() {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setVisible(true);
    requestAnimationFrame(() => { panel.current?.focus(); panel.current?.scrollIntoView({ block: "nearest" }); });
  }
  return <PrivacyContext.Provider value={{ performance: choice?.performance === true, choose, open }}>
    {visible && <aside className="privacy-consent" aria-labelledby="privacy-choice-heading" tabIndex={-1} ref={panel}>
      <div><h2 id="privacy-choice-heading">Your privacy choices</h2>
        <p>Scene uses essential device storage to keep you signed in, save your library and remember your choices. Optional performance reports are off unless you allow them.</p>
        <p className="fine-print">Performance reporting also needs your account’s sharing setting. No advertising trackers. You can change this choice at any time in Cookie settings. <a href="/cookies">Read the cookie policy</a>.</p>
      </div>
      <div className="privacy-choice-actions">
        <button type="button" className="button secondary" onClick={() => choose(false)}>Essential only</button>
        <button type="button" className="button secondary" onClick={() => choose(true)}>Allow performance reports</button>
      </div>
    </aside>}
    {storageNotice && <p className="privacy-storage-notice" role="status">{storageNotice}</p>}
    {children}
  </PrivacyContext.Provider>;
}
export function CookieSettingsButton() {
  const privacy = usePrivacyConsent();
  return <button type="button" className="text-button" onClick={privacy.open}>Cookie settings</button>;
}
export function PerformanceSharing({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => void }) {
  const privacy = usePrivacyConsent();
  return <div>
    <label className="check-filter"><input type="checkbox" checked={enabled && privacy.performance} onChange={e => { privacy.choose(e.target.checked); onChange(e.target.checked); }} />Share performance totals</label>
    <p className="fine-print">Optional. Share grouped loading, tap-response and search/browse success measurements. No search text, viewing history, names or email addresses are included in the totals. Turning this off stops new reports and clears unsent measurements. Reports travel through your signed-in connection before being grouped.</p>
  </div>;
}
