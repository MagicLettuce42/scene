import { requireSceneMember } from "../../../lib/auth/server";
export async function GET(req: Request) {
  const auth = await requireSceneMember(req, { allowMfaSetup: true });
  if (auth.error) return auth.error;
  return Response.json(
    {
      id: auth.user.id,
      email: auth.member.email,
      name: auth.member.display_name,
      role: auth.member.role,
      security: auth.security,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
