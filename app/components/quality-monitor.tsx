"use client";
import { useEffect } from "react";
import { sceneFetch } from "../../lib/auth/client";
import { onSessionBoundaryChange, sessionBoundary } from "../../lib/auth/session-boundary";
import { recordQuality, setQualityConsent, takeQualitySamples } from "../../lib/quality";
export default function QualityMonitor({ userId, enabled }: { userId: string; enabled: boolean }) {
  useEffect(() => {
    setQualityConsent(userId, enabled);
    const unsubscribe = onSessionBoundaryChange(() => setQualityConsent(null, false));
    if (!enabled) return unsubscribe;
    const observers: PerformanceObserver[] = [];
    for (const type of ["largest-contentful-paint", "event"]) {
      try {
        const observer = new PerformanceObserver(list => {
          const rows = list.getEntries();
          const value = type === "event" ? Math.max(...rows.map(r => r.duration)) : rows.at(-1)?.startTime;
          if (typeof value === "number") recordQuality(type === "event" ? "interaction" : "load", value);
        });
        observer.observe({ type, buffered: true, ...(type === "event" ? { durationThreshold: 40 } : {}) }); observers.push(observer);
      } catch { /* Browser support varies; network measurements remain available. */ }
    }
    let sending = false;
    const timer = setInterval(async () => {
      if (sending || sessionBoundary().userId !== userId || document.visibilityState !== "visible") return;
      const samples = takeQualitySamples(userId); if (!samples.length) return;
      sending = true;
      try { await sceneFetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "quality", samples }) }, userId); }
      catch { /* Optional diagnostics must never disrupt browsing. */ } finally { sending = false; }
    }, 30000);
    return () => { clearInterval(timer); observers.forEach(o => o.disconnect()); unsubscribe(); setQualityConsent(null, false); };
  }, [userId, enabled]);
  return null;
}
