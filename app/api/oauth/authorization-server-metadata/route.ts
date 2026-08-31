import {
  authorizationServerMetadata,
  corsPreflight,
  OAUTH_CORS_HEADERS,
} from "@/lib/oauth/metadata";

// Served as /.well-known/oauth-authorization-server via next.config rewrites.
export function GET() {
  return Response.json(authorizationServerMetadata(), {
    headers: OAUTH_CORS_HEADERS,
  });
}

export function OPTIONS() {
  return corsPreflight();
}
