import { createServiceClient } from "@/lib/supabase/service";
import { hashMcpToken, MCP_TOKEN_PREFIX } from "@/lib/mcp/token";

/**
 * The caller identity every MCP tool is scoped by: one planner, one club.
 * Established per request from a bearer token; the planner role and the
 * organization's active flag are re-checked on every call so revocation,
 * demotion, and deactivation take effect immediately.
 */
export type McpPlannerContext = {
  tokenId: string;
  userId: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
};

type TokenRow = {
  id: string;
  user_id: string;
  organization_id: string;
  revoked_at: string | null;
  organizations: {
    name: string;
    slug: string;
    is_active: boolean;
  } | null;
};

export async function authenticateMcpRequest(
  request: Request,
): Promise<McpPlannerContext | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (!token.startsWith(MCP_TOKEN_PREFIX)) return null;

  const db = createServiceClient();
  const { data, error } = await db
    .from("mcp_tokens")
    .select(
      "id, user_id, organization_id, revoked_at, organizations (name, slug, is_active)",
    )
    .eq("token_hash", hashMcpToken(token))
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = data as TokenRow | null;
  if (!row || row.revoked_at || !row.organizations?.is_active) return null;

  const { data: membership, error: memberError } = await db
    .from("organization_members")
    .select("role")
    .eq("organization_id", row.organization_id)
    .eq("user_id", row.user_id)
    .maybeSingle();
  if (memberError) throw new Error(memberError.message);
  if (membership?.role !== "planner") return null;

  await db
    .from("mcp_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return {
    tokenId: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    organizationName: row.organizations.name,
    organizationSlug: row.organizations.slug,
  };
}
