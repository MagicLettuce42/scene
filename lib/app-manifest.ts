import { halloweenActive } from "./seasonal";
import { appIcons } from "./app-icons";

export function appManifest(now = new Date()) {
  const halloween = halloweenActive(now),
    background = halloween ? "#16121d" : "#faf9f7";
  return {
    id: "/",
    name: "Scene — Find your next watch",
    short_name: "Scene",
    description: "Find your next watch, follow upcoming releases and keep your watchlist across devices.",
    lang: "en-GB",
    start_url: "/?source=homescreen",
    scope: "/",
    display: "standalone",
    background_color: background,
    theme_color: background,
    icons: [
      {
        src: appIcons.small,
        sizes: "192x192", type: "image/png", purpose: "any",
      },
      {
        src: appIcons.large,
        sizes: "512x512", type: "image/png", purpose: "any",
      },
      {
        src: appIcons.maskable,
        sizes: "512x512", type: "image/png", purpose: "maskable",
      },
    ],
    categories: ["entertainment", "lifestyle"],
    prefer_related_applications: false,
  };
}
