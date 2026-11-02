import type { ReactNode } from "react";
import SceneWordmark from "./scene-wordmark";
export const operatorName = process.env.SCENE_OPERATOR_NAME || "Scene’s owner";
const contact = process.env.SCENE_PRIVACY_EMAIL?.trim();
export function PrivacyContact() {
  return contact && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)
    ? <a href={`mailto:${contact}`}>{contact}</a>
    : <a href="/">sign in to Scene and choose Feedback</a>;
}
export default function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <div className="legal-page"><header><a href="/" aria-label="Scene home"><SceneWordmark /></a><a href="/">Back to Scene</a></header>
    <main id="main" tabIndex={-1}><p className="eyebrow">SCENE · YOUR INFORMATION</p><h1>{title}</h1>
      {!contact && <p className="legal-contact-pending" role="note"><strong>Public contact pending.</strong> These policy pages are awaiting the operator’s approved public contact details. Existing members can use account Feedback in the meantime.</p>}<p className="legal-intro">{intro}</p><p className="fine-print">Last updated: 2 November 2026</p>{children}
    </main></div>;
}
