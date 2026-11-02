"use client";
import SelectControl from "./select-control";
import { useState } from "react";
import { sceneFetch } from "../../lib/auth/client";
import { services, type Title } from "../../lib/catalogue";
import { newId } from "../../lib/shared-lists";
import type { ReportKind } from "../../lib/product-feedback";
const names: Record<ReportKind, string> = { suggestion: "Suggest an improvement", availability: "Incorrect availability", link: "Provider link problem", bug: "Something isn’t working" };
export function FeedbackForm({ title, defaultKind = "suggestion" }: { title?: Title; defaultKind?: ReportKind }) {
  const [kind, setKind] = useState<ReportKind>(defaultKind), [message, setMessage] = useState(""),
    [service, setService] = useState(""), [busy, setBusy] = useState(false), [notice, setNotice] = useState(""),
    [error, setError] = useState(""), [id, setId] = useState("");
  return <details className="product-feedback"><summary>{title ? "Report a problem with this title" : "Feedback & suggestions"}</summary>
    <form className="stack-form" onSubmit={async e => {
      e.preventDefault(); if (busy || !message.trim()) return; setBusy(true); setError(""); setNotice("");
      const reportId = id || newId(); setId(reportId);
      try {
        const r = await sceneFetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: reportId, kind, message, service: service || null, title: title ? { id: title.id, name: title.name, kind: title.kind } : null }) });
        const data: any = await r.json(); if (!r.ok) throw Error(data.error || "Could not send feedback.");
        setNotice("Thanks—your feedback has been sent to Scene’s owner."); setMessage(""); setId("");
      } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}>
      {title && <p><strong>{title.name}</strong> is included automatically.</p>}
      <label>What would you like to tell us?<SelectControl value={kind} onChange={e => { setKind(e.target.value as ReportKind); setId(""); }}>
        {Object.entries(names).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </SelectControl></label>
      {(kind === "availability" || kind === "link") && <label>Service (optional)<SelectControl value={service} onChange={e => { setService(e.target.value); setId(""); }}>
        <option value="">Choose a service…</option>{services.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
      </SelectControl></label>}
      <label>Your feedback<textarea value={message} maxLength={1500} required rows={4} onChange={e => { setMessage(e.target.value); setId(""); }} /></label>
      <p className="fine-print">Your account reference is saved with this report; your email is not shown in the owner’s feedback inbox. Include only what is needed to explain the issue. Do not send passwords, security codes or sensitive details. <a href="/privacy">Privacy Policy</a>.</p>
      <button className="button secondary" disabled={busy || !message.trim()}>{busy ? "Sending…" : "Send feedback"}</button>
      {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    </form>
  </details>;
}
export function FeedbackInbox() {
  const [data, setData] = useState<any>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function load() { setBusy(true); setError(""); try { const r = await sceneFetch("/api/feedback"); const d: any = await r.json(); if (!r.ok) throw Error(d.error); setData(d); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  return <details className="product-feedback"><summary>Owner feedback inbox & service quality</summary>
    <p className="fine-print">The latest 100 reports. Account emails and reporter identifiers are excluded. Owner verification is required.</p>
    <button className="button secondary" disabled={busy} onClick={load}>{busy ? "Loading…" : "Refresh inbox"}</button>
    {error && <p role="alert">{error}</p>}
    {data && <><h4>Feedback</h4>{!data.reports.length && <p>No reports yet.</p>}
      {data.reports.map((r: any) => <article className="feedback-report" key={r.id}>
        <p><strong>{names[r.kind as ReportKind]}</strong> · {new Date(r.created_at).toLocaleDateString("en-GB")}</p>
        {r.title && <p>{r.title.name}{r.service ? ` · ${services.find(s => s.key === r.service)?.name || r.service}` : ""}</p>}
        <p className="feedback-text">{r.message}</p>
        <label>Status<SelectControl value={r.status} disabled={busy} onChange={async e => { setBusy(true); setError(""); try {
          const response = await sceneFetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "status", id: r.id, status: e.target.value }) });
          if (!response.ok) throw Error(((await response.json()) as { error: string }).error); await load();
        } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}><option value="new">New</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option></SelectControl></label>
      </article>)}
      <h4>Performance totals · last 7 days</h4>
      <p className="fine-print">Opt-in samples only. No names, device identifiers, search text or viewing history. These are operational measurements, not a record of what people watch. Link problems appear in reports above.</p>
      {!data.quality.length ? <p>No shared measurements yet.</p> : <div className="quality-table"><table><thead><tr><th>Day</th><th>Measurement</th><th>Speed</th><th>Samples</th><th>Average</th></tr></thead><tbody>
        {data.quality.map((q: any) => <tr key={q.day + q.metric + q.bucket}><td>{q.day}</td><td>{q.metric.replaceAll("_", " ")}</td><td>{q.bucket}</td><td>{q.samples}</td><td>{Math.round(q.total_ms / q.samples)} ms</td></tr>)}
      </tbody></table></div>}
    </>}
  </details>;
}
