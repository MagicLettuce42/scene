export const consentKey = "scene.privacy-choice.v1";
export const policyVersion = "2026-11-02";
export type PrivacyChoice = { version: typeof policyVersion; performance: boolean; savedAt: number };
export const choiceLifetime = 180 * 24 * 60 * 60 * 1000;
export function readPrivacyChoice(raw: string | null, now = Date.now()): PrivacyChoice | null {
  try {
    const value = JSON.parse(raw || "null");
    return value?.version === policyVersion && typeof value.performance === "boolean" &&
      Number.isFinite(value.savedAt) && value.savedAt <= now && now - value.savedAt < choiceLifetime
      ? { version: policyVersion, performance: value.performance, savedAt: value.savedAt } : null;
  } catch { return null; }
}
