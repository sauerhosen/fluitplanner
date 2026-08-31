"use server";

import { requireAuthContext } from "@/lib/auth";
import { getClient } from "@/lib/oauth/clients";
import { issueAuthorizationCode } from "@/lib/oauth/grants";
import { isValidResource } from "@/lib/oauth/metadata";

export type OauthApprovalInput = {
  client_id: string;
  redirect_uri: string;
  state?: string;
  code_challenge: string;
  resource?: string;
  organization_id: string;
};

/**
 * The consent page's approve action. Everything the authorize page already
 * validated is re-validated here — the form post is attacker-reachable input,
 * the rendered page is not proof of anything.
 */
export async function approveOauthRequest(
  input: OauthApprovalInput,
): Promise<string> {
  const { supabase, user } = await requireAuthContext();

  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", input.organization_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (membership?.role !== "planner") throw new Error("NOT_PLANNER");

  const client = await getClient(input.client_id);
  if (!client || !client.redirect_uris.includes(input.redirect_uri)) {
    throw new Error("Invalid client or redirect_uri");
  }
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(input.code_challenge)) {
    throw new Error("Invalid code_challenge");
  }
  if (input.resource && !isValidResource(input.resource)) {
    throw new Error("Invalid resource");
  }

  const code = await issueAuthorizationCode({
    clientId: input.client_id,
    userId: user.id,
    organizationId: input.organization_id,
    redirectUri: input.redirect_uri,
    codeChallenge: input.code_challenge,
    resource: input.resource ?? null,
  });

  const url = new URL(input.redirect_uri);
  url.searchParams.set("code", code);
  if (input.state) url.searchParams.set("state", input.state);
  return url.toString();
}
