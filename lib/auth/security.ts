export type SceneSecurity = {
  sessionValid: boolean;
  required: boolean;
  enrolled: boolean;
  verified: boolean;
  allowed: boolean;
  adminReady: boolean;
};
// Fail closed if the database response is incomplete or malformed.
export function readSecurity(value: unknown): SceneSecurity | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const keys = ["sessionValid", "required", "enrolled", "verified", "allowed", "adminReady"] as const;
  if (keys.some((key) => typeof v[key] !== "boolean")) return null;
  return Object.fromEntries(keys.map((key) => [key, v[key]])) as SceneSecurity;
}
