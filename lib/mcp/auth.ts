import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { hashMcpToken, MCP_TOKEN_PREFIX } from "@/lib/mcp/token";
import { verifyAccessToken } from "@/lib/oauth/grants";
import { ACCESS_TOKEN_PREFIX } from "@/lib/oauth/tokens";

/**
 * The caller identity every MCP tool is scoped by: one planner, one club.
 * Established per request from a bearer token — a personal access token
 * (fpm_…) or an OAuth access token (fpa_…). The planner role and the
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

export async function authenticateMcpRequest(
  request: Request,
): Promise<McpPlannerContext | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  if (token.startsWith(MCP_TOKEN_PREFIX)) {
    return authenticatePersonalToken(token);
  }
  if (token.startsWith(ACCESS_TOKEN_PREFIX)) {
    return authenticateOauthToken(token);
  }
  return null;
}

async function authenticatePersonalToken(
  token: string,
): Promise<McpPlannerContext | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("mcp_tokens")
    .select("id, user_id, organization_id, revoked_at")
    .eq("token_hash", hashMcpToken(token))
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.revoked_at) return null;

  const ctx = await resolvePlannerContext(
    db,
    data.user_id,
    data.organization_id,
  );
  if (!ctx) return null;

  await db
    .from("mcp_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return { tokenId: data.id, ...ctx };
}

async function authenticateOauthToken(
  token: string,
): Promise<McpPlannerContext | null> {
  const verified = await verifyAccessToken(token);
  if (!verified) return null;
  const ctx = await resolvePlannerContext(
    createServiceClient(),
    verified.userId,
    verified.organizationId,
  );
  if (!ctx) return null;
  return { tokenId: `oauth:${verified.clientId}`, ...ctx };
}

/** The per-request role and org-active checks both token kinds share. */
async function resolvePlannerContext(
  db: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<Omit<McpPlannerContext, "tokenId"> | null> {
  const [orgRes, memberRes] = await Promise.all([
    db
      .from("organizations")
      .select("name, slug, is_active")
      .eq("id", organizationId)
      .maybeSingle(),
    db
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (orgRes.error) throw new Error(orgRes.error.message);
  if (memberRes.error) throw new Error(memberRes.error.message);
  if (!orgRes.data?.is_active || memberRes.data?.role !== "planner")
    return null;
  return {
    userId,
    organizationId,
    organizationName: orgRes.data.name,
    organizationSlug: orgRes.data.slug,
  };
}
