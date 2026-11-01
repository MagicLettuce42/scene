import { appManifest } from "../../lib/app-manifest";

export function GET() {
  return new Response(JSON.stringify(appManifest()), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
