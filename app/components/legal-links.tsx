"use client";
import { CookieSettingsButton } from "./privacy-consent";
export default function LegalLinks() {
  return <footer className="legal-footer"><nav aria-label="Policies and your data">
    <a href="/privacy">Privacy Policy</a><a href="/terms">Terms of service</a><a href="/cookies">Cookie policy</a>
    <CookieSettingsButton /><a href="/accessibility">Accessibility</a><a href="/delete-account">Delete my data</a>
  </nav><noscript>Optional performance reporting is off without JavaScript.</noscript></footer>;
}
