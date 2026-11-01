"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type AppInstall = {
  available: boolean;
  installed: boolean;
  standalone: boolean;
  platform: "android" | "ios" | "other";
  busy: boolean;
  message: string;
  install: () => Promise<void>;
};
const InstallContext = createContext<AppInstall>({
  available: false,
  installed: false,
  standalone: false,
  platform: "other",
  busy: false,
  message: "",
  install: async () => {},
});
export const useAppInstall = () => useContext(InstallContext);
// Mounted for the entire visit, so opening Account later cannot miss the event.
export default function AppInstallProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null),
    [installed, setInstalled] = useState(false),
    [standalone, setStandalone] = useState(false),
    [platform, setPlatform] = useState<AppInstall["platform"]>("other"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    const check = () => {
      const app = mode.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setStandalone(app);
      if (app) setInstalled(true);
    };
    check();
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    setPlatform(ios ? "ios" : /Android/i.test(navigator.userAgent) ? "android" : "other");
    const capture = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
      setMessage("");
    };
    const added = () => {
      setInstalled(true);
      setPrompt(null);
      setMessage("Scene has been added to your apps.");
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", added);
    mode.addEventListener("change", check);
    if (window.isSecureContext && "serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
        /* Online use and manual installation remain available. */
      });
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", added);
      mode.removeEventListener("change", check);
    };
  }, []);
  async function install() {
    if (!prompt || busy) return;
    const request = prompt;
    setPrompt(null);
    setBusy(true);
    setMessage("");
    try {
      await request.prompt();
      const choice = await request.userChoice;
      setMessage(
        choice.outcome === "accepted"
          ? "Installation requested. Open Scene from your apps when it finishes."
          : "Installation cancelled. You can still install Scene from your browser menu.",
      );
    } catch {
      setMessage("Use your browser menu and choose Install app or Add to Home Screen.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <InstallContext.Provider
      value={{ available: !!prompt, installed, standalone, platform, busy, message, install }}
    >
      {children}
    </InstallContext.Provider>
  );
}
