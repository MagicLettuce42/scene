import { requireSceneMember } from "../../../lib/auth/server";
import { cleanReport, cleanSamples } from "../../../lib/product-feedback";
import { validUuid } from "../../../lib/shared-lists";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(req: Request) {
  const auth = await requireSceneMember(req); if (auth.error) return auth.error;
  if (auth.member.role !== "owner" || !auth.security.adminReady) return reply({ error: "Verify your owner account to open the feedback inbox." }, 403);
  const r = await auth.client.rpc("scene_product", { p_action: "inbox", p_data: {} });
  return r.error ? reply({ error: "Feedback could not load." }, 503) : reply(r.data);
}
export async function POST(req: Request) {
  const auth = await requireSceneMember(req); if (auth.error) return auth.error;
  let b: any;
  try { const raw = await req.text(); if (raw.length > 10000) return reply({ error: "This report is too long." }, 413); b = JSON.parse(raw); }
  catch { return reply({ error: "Check your report." }, 400); }
  let action = "submit", data: any = cleanReport(b);
  if (b?.action === "quality") { action = "quality"; const samples = cleanSamples(b.samples); data = samples ? { samples } : null; }
  if (b?.action === "status") {
    if (auth.member.role !== "owner" || !auth.security.adminReady) return reply({ error: "Owner verification required." }, 403);
    action = "status"; data = validUuid(b.id) && ["new", "reviewing", "resolved"].includes(b.status) ? { id: b.id, status: b.status } : null;
  }
  if (!data) return reply({ error: "Check your feedback and try again." }, 400);
  const r = await auth.client.rpc("scene_product", { p_action: action, p_data: data });
  return r.error ? reply({ error: r.error.code === "22023" ? r.error.message : "Could not send this. Please try again." }, r.error.code === "22023" ? 400 : 503) : reply(r.data);
}
