"use server";

import { requirePlanner } from "@/lib/auth";
import { generateMcpToken } from "@/lib/mcp/token";

export type McpTokenInfo = {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const TOKEN_COLUMNS =
  "id, name, token_prefix, created_at, last_used_at, revoked_at";

/** The caller's own MCP tokens for the current club, newest first. */
export async function getMcpTokens(): Promise<McpTokenInfo[]> {
  const { supabase, user, tenantId } = await requirePlanner();
  const { data, error } = await supabase
    .from("mcp_tokens")
    .select(TOKEN_COLUMNS)
    .eq("user_id", user.id)
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as McpTokenInfo[];
}

/**
 * Create a token for the current planner in the current club. The plaintext
 * token is returned exactly once; only its hash is stored.
 */
export async function createMcpToken(
  name: string,
): Promise<{ token: string; info: McpTokenInfo }> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 100) throw new Error("Invalid token name");
  const { supabase, user, tenantId } = await requirePlanner();

  const { token, hash, prefix } = generateMcpToken();
  const { data, error } = await supabase
    .from("mcp_tokens")
    .insert({
      user_id: user.id,
      organization_id: tenantId,
      name: trimmed,
      token_hash: hash,
      token_prefix: prefix,
    })
    .select(TOKEN_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return { token, info: data as McpTokenInfo };
}

export async function revokeMcpToken(id: string): Promise<void> {
  const { supabase, user, tenantId } = await requirePlanner();
  const { error } = await supabase
    .from("mcp_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .eq("organization_id", tenantId)
    .is("revoked_at", null);
  if (error) throw new Error(error.message);
}
