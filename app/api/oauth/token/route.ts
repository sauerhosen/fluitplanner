import { getClient } from "@/lib/oauth/clients";
import {
  consumeAuthorizationCode,
  issueTokens,
  rotateRefreshToken,
} from "@/lib/oauth/grants";
import {
  isValidResource,
  corsPreflight,
  OAUTH_CORS_HEADERS,
} from "@/lib/oauth/metadata";
import { verifyPkceS256 } from "@/lib/oauth/tokens";

/**
 * OAuth token endpoint (RFC 6749 §3.2): authorization_code with mandatory
 * PKCE, and refresh_token with rotation. Public clients only — there is no
 * client secret; possession of the code + verifier (or refresh token) is the
 * proof.
 */
export async function POST(request: Request) {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(await request.text());
  } catch {
    return tokenError("invalid_request", "Body must be form-encoded");
  }
  const grantType = params.get("grant_type");

  if (grantType === "authorization_code") {
    return handleAuthorizationCode(params);
  }
  if (grantType === "refresh_token") {
    return handleRefreshToken(params);
  }
  return tokenError(
    "unsupported_grant_type",
    "Supported grant types: authorization_code, refresh_token",
  );
}

async function handleAuthorizationCode(params: URLSearchParams) {
  const code = params.get("code");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeVerifier = params.get("code_verifier");
  const resource = params.get("resource");

  if (!code || !clientId || !codeVerifier) {
    return tokenError(
      "invalid_request",
      "code, client_id and code_verifier are required",
    );
  }
  if (resource && !isValidResource(resource)) {
    return tokenError("invalid_target", "Unknown resource");
  }

  const grant = await consumeAuthorizationCode(code);
  if (!grant) {
    return tokenError(
      "invalid_grant",
      "Code is invalid, expired, or already used",
    );
  }
  if (grant.client_id !== clientId) {
    return tokenError("invalid_grant", "Code was issued to a different client");
  }
  // RFC 6749 §4.1.3: redirect_uri must match the authorization request's.
  if (redirectUri !== grant.redirect_uri) {
    return tokenError("invalid_grant", "redirect_uri does not match");
  }
  if (!verifyPkceS256(codeVerifier, grant.code_challenge)) {
    return tokenError("invalid_grant", "PKCE verification failed");
  }

  const tokens = await issueTokens({
    clientId: grant.client_id,
    userId: grant.user_id,
    organizationId: grant.organization_id,
  });
  return Response.json(tokens, { headers: OAUTH_CORS_HEADERS });
}

async function handleRefreshToken(params: URLSearchParams) {
  const refreshToken = params.get("refresh_token");
  const clientId = params.get("client_id");
  if (!refreshToken || !clientId) {
    return tokenError(
      "invalid_request",
      "refresh_token and client_id are required",
    );
  }
  const client = await getClient(clientId).catch(() => null);
  if (!client) return tokenError("invalid_client", "Unknown client");

  const tokens = await rotateRefreshToken(refreshToken, clientId);
  if (!tokens) {
    return tokenError(
      "invalid_grant",
      "Refresh token is invalid, expired, or revoked",
    );
  }
  return Response.json(tokens, { headers: OAUTH_CORS_HEADERS });
}

function tokenError(error: string, description: string) {
  return Response.json(
    { error, error_description: description },
    { status: 400, headers: OAUTH_CORS_HEADERS },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
