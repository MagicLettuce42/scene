import { requireSceneMember } from "../../../lib/auth/server";
import { hasLiveFeed, catalogueSource, hasDirectLinks } from "../../../lib/server-catalogue";
export async function GET(req: Request) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  return Response.json(
    { live: hasLiveFeed(), source: catalogueSource(), directLinks: hasDirectLinks() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
