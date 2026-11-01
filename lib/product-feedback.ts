import { services } from "./catalogue";
import { validUuid } from "./shared-lists";
export const reportKinds = ["suggestion", "availability", "link", "bug"] as const;
export type ReportKind = typeof reportKinds[number];
export function cleanReport(value: unknown) {
  const v = value as any;
  if (!v || !validUuid(v.id) || !reportKinds.includes(v.kind) || typeof v.message !== "string" ||
    !v.message.trim() || v.message.trim().length > 1500 || (v.service && !services.some(s => s.key === v.service))) return null;
  let title = null;
  if (v.title) {
    if (typeof v.title.name !== "string" || !v.title.name.trim() || v.title.name.length > 200 ||
      !["movie", "series"].includes(v.title.kind) || typeof v.title.id !== "string" || v.title.id.length > 100) return null;
    title = { id: v.title.id, name: v.title.name, kind: v.title.kind };
  }
  return { id: v.id, kind: v.kind, message: v.message.trim(), title, service: v.service || null };
}
export const qualityMetrics = ["load", "interaction", "search_ok", "search_error", "browse_ok", "browse_error"] as const;
export type QualitySample = { metric: typeof qualityMetrics[number]; ms: number };
export function cleanSamples(value: unknown): QualitySample[] | null {
  if (!Array.isArray(value) || !value.length || value.length > 10) return null;
  return value.every(s => s && qualityMetrics.includes(s.metric) && Number.isInteger(s.ms) && s.ms >= 0 && s.ms <= 60000)
    ? value.map(s => ({ metric: s.metric, ms: s.ms })) : null;
}
