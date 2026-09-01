import {
  corsPreflight,
  OAUTH_CORS_HEADERS,
  protectedResourceMetadata,
} from "@/lib/oauth/metadata";

// Served as /.well-known/oauth-protected-resource via next.config rewrites.
export function GET() {
  return Response.json(protectedResourceMetadata(), {
    headers: OAUTH_CORS_HEADERS,
  });
}

export function OPTIONS() {
  return corsPreflight();
}
