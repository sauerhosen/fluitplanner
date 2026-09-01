/**
 * OAuth discovery documents (RFC 8414 authorization-server metadata and
 * RFC 9728 protected-resource metadata) plus the shared URL/CORS helpers.
 * The /.well-known/* paths are rewritten to the serving routes in
 * next.config.ts.
 */

export function baseUrl(): string {
  // Trim before anything else: env values picked up a trailing newline in
  // the wild (`echo … | vercel env add`), and a newline reaching the 401
  // WWW-Authenticate header makes Headers construction throw — turning
  // every unauthenticated MCP request into a 500.
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
    .trim()
    .replace(/\/$/, "");
}

export function mcpResourceUrl(): string {
  return `${baseUrl()}/api/mcp`;
}

/** RFC 8707 resource indicator check, tolerant of a trailing slash. */
export function isValidResource(resource: string): boolean {
  return resource.replace(/\/$/, "") === mcpResourceUrl();
}

export function authorizationServerMetadata() {
  const issuer = baseUrl();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/api/oauth/token`,
    registration_endpoint: `${issuer}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["planner"],
    client_id_metadata_document_supported: true,
  };
}

export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [baseUrl()],
    bearer_methods_supported: ["header"],
    scopes_supported: ["planner"],
  };
}

/** Discovery/token/register endpoints are called cross-origin by MCP hosts. */
export const OAUTH_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
} as const;

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}
