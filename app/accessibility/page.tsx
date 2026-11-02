import LegalPage, { PrivacyContact, operatorName } from "../components/legal-page";
export const metadata = { title: "Accessibility · Scene" };
export default function AccessibilityPage() {
  return <LegalPage title="Accessibility" intro="Using Scene with a keyboard, assistive technology or a smaller screen.">
    <h2>Built-in support</h2><ul><li>Use Tab and Shift+Tab to move between controls, and Enter or Space to activate them.</li><li>Use Skip to content to reach the main area. Focus indicators show your current control.</li><li>Search suggestions support arrow keys. Escape closes suggestions; dialogs can be closed with Escape or their Close button.</li><li>Forms use visible labels and expose errors and status messages. Password visibility controls have accessible names.</li><li>Informative images have text alternatives; artwork repeated by nearby labelled controls and purely decorative images may have empty alternatives to avoid repetition.</li><li>You can zoom the page, use responsive layouts and choose a theme. Motion respects reduced-motion preferences where supported.</li></ul>
    <h2>Tell us about a barrier</h2><p>We aim to improve accessibility against WCAG 2.2 AA. This page is not a claim that every part of Scene or linked provider sites meets that standard. If a control, contrast, image or keyboard interaction blocks you, use Feedback or email <PrivacyContact />. Tell us the page, what you tried and your browser or assistive technology if you are comfortable sharing it. Avoid passwords and security codes.</p>
  </LegalPage>;
}
