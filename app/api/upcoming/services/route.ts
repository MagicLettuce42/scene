import { regionalHandler } from "../../../../lib/region-server";
import { requireSceneMember } from "../../../../lib/auth/server";
import { parseArrivalQuery, serviceArrivals } from "../../../../lib/service-arrivals";
async function handleGET(req: Request) {
  const access = await requireSceneMember(req);
  if (access.error) return access.error;
  const options = parseArrivalQuery(new URL(req.url).searchParams);
  if (!options) return Response.json({ error: "Invalid service or date filters." }, { status: 400 });
  try {
    return Response.json(await serviceArrivals(options, access.client), {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return Response.json({ error: "Service arrivals could not load. Please try again." }, { status: 503 });
  }
}

export const GET = regionalHandler(handleGET);
