import { authConfigured } from "../../../lib/auth/server";
import { readAccessRequest } from "../../../supabase/functions/_shared/access-request";
import { privateAccessResponse } from "../../../supabase/functions/_shared/access-privacy";
import { isSceneOrigin } from "../../../supabase/functions/_shared/scene-origins";
export async function POST(req: Request) {
  if (!authConfigured()) return Response.json({ error: "Scene accounts are being set up." }, { status: 503 });
  const data = await readAccessRequest(req);
  if (data instanceof Response) return data;
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: process.env.SUPABASE_PUBLISHABLE_KEY!,
    };
    const origin = new URL(req.url).origin;
    if (isSceneOrigin(origin)) headers.Origin = origin;
    const auth = req.headers.get("authorization");
    if (auth) headers.Authorization = auth;
    const response = await fetch(process.env.SUPABASE_URL + "/functions/v1/scene-access", {
      method: "POST",
      headers,
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(20000),
    });
    const responseHeaders: Record<string, string> = { "Cache-Control": "no-store" };
    const retry = response.headers.get("Retry-After");
    if (response.status === 429 && retry && /^\d{1,5}$/.test(retry)) responseHeaders["Retry-After"] = retry;
    return Response.json(privateAccessResponse(data.action, await response.json()), { status: response.status, headers: responseHeaders });
  } catch {
    return Response.json(
      { error: "Account access is temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }
}
