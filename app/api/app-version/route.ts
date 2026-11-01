import release from "../../../lib/app-release.json";
export function GET() {
  return Response.json(release, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
