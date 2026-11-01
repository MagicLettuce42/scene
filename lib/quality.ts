"use client";
import type { QualitySample } from "./product-feedback";
let owner: string | null = null, allowed = false;
let samples: QualitySample[] = [];
export function setQualityConsent(userId: string | null, value: boolean) {
  if (owner !== userId || !value) samples = [];
  owner = userId; allowed = value;
}
export function recordQuality(metric: QualitySample["metric"], ms: number) {
  if (allowed && Number.isFinite(ms)) samples.push({ metric, ms: Math.max(0, Math.min(60000, Math.round(ms))) });
  if (samples.length > 30) samples.shift();
}
export function takeQualitySamples(userId: string) {
  return allowed && owner === userId ? samples.splice(0, 10) : [];
}
