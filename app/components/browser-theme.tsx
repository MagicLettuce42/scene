"use client";
import { useEffect } from "react";
import { resolveTheme, themes } from "../../lib/themes";
import { appIcons } from "../../lib/app-icons";

export default function BrowserTheme() {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const id = resolveTheme(root.dataset.theme),
        theme = themes.find((theme) => theme.id === id)!;
      for (const icon of document.querySelectorAll<HTMLLinkElement>(
        'link[rel="icon"],link[rel="shortcut icon"]',
      )) {
        icon.setAttribute("href", appIcons.favicon);
        icon.setAttribute("type", "image/png");
      }
      for (const icon of document.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]')) {
        icon.setAttribute("href", appIcons.apple);
        icon.setAttribute("type", "image/png");
        icon.setAttribute("sizes", "180x180");
      }
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.background);
    };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return null;
}
