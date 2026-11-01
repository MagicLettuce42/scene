import { type Title } from "./catalogue";
export type SharedList = {
  id: string;
  name: string;
  ownerId: string;
  archived: boolean;
  count: number;
  members: number;
};
export type SharedItem = { key: string; title: Title; addedBy: string; votes: number; voted: boolean };
export type SharedDetail = {
  id: string;
  name: string;
  ownerId: string;
  people: { id: string; name: string }[];
  items: SharedItem[];
  invites: { id: string; name: string; expiresAt: string }[];
};
export type SharedInvitation = { id: string; name: string; owner?: string; joined: boolean };
export const validUuid = (v: unknown): v is string =>
  typeof v === "string" && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(v);
export function newId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, (n) => n.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function rankSharedItems(items: SharedItem[]) {
  return [...items].sort((a, b) => b.votes - a.votes || a.title.name.localeCompare(b.title.name));
}
