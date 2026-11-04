const productionOrigin = "https://scene-streaming.airyokapi2.chatgpt.site";
const bodyLimit = 800_000;
const blocked = (message: string, status: number) => Response.json({ error: message }, { status });
export async function secureRequest(request: Request): Promise<Request | Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return request;
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== url.origin && origin !== productionOrigin)
  )
    return blocked("This request must come from Scene.", 403);
  if (!["GET", "HEAD", "POST"].includes(request.method)) return blocked("Method not allowed.", 405);
  if (request.method !== "POST") return request;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return blocked("Send a JSON request.", 415);
  const limit = url.pathname === "/api/access" ? 5000 : bodyLimit;
  if (Number(request.headers.get("content-length") || 0) > limit)
    return blocked("This request is too large.", 413);
  if (!request.body) return request;
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        return blocked("This request is too large.", 413);
      }
      chunks.push(chunk.value);
    }
  } catch {
    return blocked("The request could not be read.", 400);
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body: bytes });
}
export function secureResponse(request: Request, response: Response): Response {
  const headers = new Headers(response.headers),
    url = new URL(request.url);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  if (url.protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000");
  // Allow the trusted ChatGPT site viewer; deny embedding on arbitrary sites.
  // Restrict active content without breaking Vinext's streamed inline boot scripts.
  headers.set(
    "Content-Security-Policy",
    "base-uri 'none'; object-src 'none'; frame-ancestors 'self' https://chatgpt.com; form-action 'self'; script-src-attr 'none'; upgrade-insecure-requests",
  );
  // A strict script policy needs nonce/hydration browser QA before enforcement.
  headers.set(
    "Content-Security-Policy-Report-Only",
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://cqgauurbkmdbxckjdals.supabase.co https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'",
  );
  if (url.pathname.startsWith("/api/")) headers.set("Cache-Control",
    headers.get("Content-Type")?.startsWith("application/x-ndjson") ? "no-store, no-transform" : "no-store");
  if (url.pathname === "/sw.js" || url.pathname === "/manifest.webmanifest")
    headers.set("Cache-Control", "no-cache");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
