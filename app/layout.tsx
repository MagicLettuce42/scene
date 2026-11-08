import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./daylight.css";
import AppInstallProvider from "./components/app-install-provider";
import BrowserTheme from "./components/browser-theme";
import AppUpdateProvider from "./components/app-updates";
import { appIcons } from "../lib/app-icons";
import { effectiveTheme } from "../lib/seasonal";
import { defaultTheme } from "../lib/themes";
import PrivacyConsent from "./components/privacy-consent";
import LegalLinks from "./components/legal-links";

export function generateMetadata(): Metadata {
  const icon = appIcons.favicon;
  return {
    title: "Scene — Find your next watch",
    description:
      "Find films and TV series, explore UK streaming options and keep one watchlist. Less searching. More watching.",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, title: "Scene", statusBarStyle: "default" },
    icons: {
      apple: appIcons.apple,
      icon,
      shortcut: icon,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#faf9f7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme={effectiveTheme(defaultTheme)}>
      <body className="antialiased">
        <a className="skip-link" href="#main">Skip to content</a>
        <PrivacyConsent>
        <AppInstallProvider>
          <AppUpdateProvider>
          <BrowserTheme />
          {children}
          </AppUpdateProvider>
        </AppInstallProvider>
        <LegalLinks />
        </PrivacyConsent>
      </body>
    </html>
  );
}
