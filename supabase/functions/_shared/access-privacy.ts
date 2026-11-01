type Fields = Record<string, unknown>;
const fields = (value: unknown): Fields => value && typeof value === "object" && !Array.isArray(value) ? value as Fields : {};
const text = (value: unknown) => typeof value === "string" ? value : "";

export function privateDisplayName(value: unknown) {
  const name = text(value).trim();
  return name && !name.includes("@") ? name.slice(0, 80) : "Scene member";
}

export function invitedEmailMatches(provided: unknown, expected: string) {
  return typeof provided === "string" && provided.trim().length > 0 && provided.trim().length <= 254
    && provided.trim().toLowerCase() === expected.toLowerCase();
}

// Explicit response fields protect both the Edge Function and the Site proxy.
// Email addresses remain server-side, including when an owner holds an invite.
export function privateAccessResponse(action: unknown, payload: unknown) {
  const value = fields(payload);
  if (typeof value.error === "string") return {
    error: value.error,
    ...(typeof value.code === "string" ? { code: value.code } : {}),
  };
  if (action === "list") return {
    members: (Array.isArray(value.members) ? value.members : []).map((entry) => {
      const member = fields(entry);
      return { user_id: text(member.user_id), display_name: privateDisplayName(member.display_name),
        role: member.role === "owner" ? "owner" : "member", active: member.active === true };
    }),
    invites: (Array.isArray(value.invites) ? value.invites : []).map((entry) => {
      const invite = fields(entry), id = text(invite.token_hash);
      return { token_hash: id, label: `Invitation ${id.slice(0, 8).toUpperCase()}`, expires_at: text(invite.expires_at) };
    }),
  };
  if (action === "inspect") return { emailRequired: true, expiresAt: text(value.expiresAt) };
  if (action === "join") return { accepted: value.accepted === true };
  if (action === "invite") return { url: text(value.url), expiresAt: text(value.expiresAt) };
  if (action === "revoke") return { revoked: value.revoked === true };
  if (action === "cancel-invite") return { cancelled: value.cancelled === true };
  return {};
}
