import { createServiceClient } from "@/lib/supabase/service";
import {
  ACCESS_TOKEN_PREFIX,
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_CODE_PREFIX,
  AUTHORIZATION_CODE_TTL_SECONDS,
  REFRESH_TOKEN_PREFIX,
  REFRESH_TOKEN_TTL_SECONDS,
  generateSecret,
  sha256Hex,
} from "@/lib/oauth/tokens";

/** Authorization codes and bearer tokens: issue, consume, verify, rotate. */

export const OAUTH_SCOPE = "planner";

export type AuthorizationCodeGrant = {
  clientId: string;
  userId: string;
  organizationId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
};

export async function issueAuthorizationCode(
  grant: AuthorizationCodeGrant,
): Promise<string> {
  const code = generateSecret(AUTHORIZATION_CODE_PREFIX);
  const { error } = await createServiceClient()
    .from("oauth_authorization_codes")
    .insert({
      code_hash: sha256Hex(code),
      client_id: grant.clientId,
      user_id: grant.userId,
      organization_id: grant.organizationId,
      redirect_uri: grant.redirectUri,
      code_challenge: grant.codeChallenge,
      code_challenge_method: "S256",
      scope: OAUTH_SCOPE,
      resource: grant.resource,
      expires_at: new Date(
        Date.now() + AUTHORIZATION_CODE_TTL_SECONDS * 1000,
      ).toISOString(),
    });
  if (error) throw new Error(error.message);
  return code;
}

export type ConsumedCode = {
  client_id: string;
  user_id: string;
  organization_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string | null;
  resource: string | null;
};

/**
 * Single-use consumption: the row is claimed atomically, so a replayed code
 * fails even under concurrent requests. Returns null for unknown, expired,
 * or already-used codes.
 */
export async function consumeAuthorizationCode(
  code: string,
): Promise<ConsumedCode | null> {
  const { data, error } = await createServiceClient()
    .from("oauth_authorization_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", sha256Hex(code))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select(
      "client_id, user_id, organization_id, redirect_uri, code_challenge, scope, resource",
    )
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ConsumedCode | null) ?? null;
}

export type IssuedTokens = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

export async function issueTokens(grant: {
  clientId: string;
  userId: string;
  organizationId: string;
}): Promise<IssuedTokens> {
  const accessToken = generateSecret(ACCESS_TOKEN_PREFIX);
  const refreshToken = generateSecret(REFRESH_TOKEN_PREFIX);
  const { error } = await createServiceClient()
    .from("oauth_tokens")
    .insert({
      client_id: grant.clientId,
      user_id: grant.userId,
      organization_id: grant.organizationId,
      access_token_hash: sha256Hex(accessToken),
      refresh_token_hash: sha256Hex(refreshToken),
      scope: OAUTH_SCOPE,
      access_expires_at: new Date(
        Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
      ).toISOString(),
      refresh_expires_at: new Date(
        Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
      ).toISOString(),
    });
  if (error) throw new Error(error.message);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refreshToken,
    scope: OAUTH_SCOPE,
  };
}

/**
 * Refresh-token rotation: the stored row gets fresh hashes and expiries in a
 * single atomic update, so the old access AND refresh tokens die together.
 * Returns null when the refresh token is unknown, expired, revoked, or
 * presented by a different client.
 */
export async function rotateRefreshToken(
  refreshToken: string,
  clientId: string,
): Promise<IssuedTokens | null> {
  const newAccess = generateSecret(ACCESS_TOKEN_PREFIX);
  const newRefresh = generateSecret(REFRESH_TOKEN_PREFIX);
  const { data, error } = await createServiceClient()
    .from("oauth_tokens")
    .update({
      access_token_hash: sha256Hex(newAccess),
      refresh_token_hash: sha256Hex(newRefresh),
      access_expires_at: new Date(
        Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000,
      ).toISOString(),
      refresh_expires_at: new Date(
        Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
      ).toISOString(),
    })
    .eq("refresh_token_hash", sha256Hex(refreshToken))
    .eq("client_id", clientId)
    .is("revoked_at", null)
    .gt("refresh_expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    access_token: newAccess,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: newRefresh,
    scope: OAUTH_SCOPE,
  };
}

export type VerifiedAccessToken = {
  userId: string;
  organizationId: string;
  clientId: string;
};

export async function verifyAccessToken(
  accessToken: string,
): Promise<VerifiedAccessToken | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("oauth_tokens")
    .select("id, user_id, organization_id, client_id")
    .eq("access_token_hash", sha256Hex(accessToken))
    .is("revoked_at", null)
    .gt("access_expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  await db
    .from("oauth_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return {
    userId: data.user_id,
    organizationId: data.organization_id,
    clientId: data.client_id,
  };
}
