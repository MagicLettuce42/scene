import { requireSceneMember } from "../../../../lib/auth/server";
import { parseActivityQuery, serviceActivity } from "../../../../lib/service-activity";
export async function GET(req: Request) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  const options = parseActivityQuery(new URL(req.url).searchParams);
  if (!options) return Response.json({ error: "Invalid service filters." }, { status: 400 });
  try {
    return Response.json(await serviceActivity(options.mode, options.selected, access.client), {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return Response.json(
      { error: "These service updates could not load. Please try again." },
      { status: 503 },
    );
  }
}
