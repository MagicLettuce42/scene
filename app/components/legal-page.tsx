import type { ReactNode } from "react";
import SceneWordmark from "./scene-wordmark";
export const operatorName = process.env.SCENE_OPERATOR_NAME || "Ben Lear";
const contact = process.env.SCENE_PRIVACY_EMAIL?.trim() || "ben.digitalservices@outlook.com";
export function PrivacyContact() {
  return contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
    ? <a href={`mailto:${contact}`}>{contact}</a>
    : <a href="/">sign in to Scene and choose Feedback</a>;
}
export default function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <div className="legal-page"><header><a href="/" aria-label="Scene home"><SceneWordmark /></a><a href="/">Back to Scene</a></header>
    <main id="main" tabIndex={-1}><p className="eyebrow">SCENE · YOUR INFORMATION</p><h1>{title}</h1>
      <p className="legal-intro">{intro}</p><p className="fine-print">Last updated: 2 November 2026</p>{children}
    </main></div>;
}
