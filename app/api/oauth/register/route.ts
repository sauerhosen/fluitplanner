import { registerDcrClient, OauthClientError } from "@/lib/oauth/clients";
import { corsPreflight, OAUTH_CORS_HEADERS } from "@/lib/oauth/metadata";

/** Dynamic Client Registration (RFC 7591) — public clients, PKCE only. */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_client_metadata", "Body must be JSON");
  }
  try {
    const metadata = await registerDcrClient(body);
    return Response.json(metadata, {
      status: 201,
      headers: OAUTH_CORS_HEADERS,
    });
  } catch (error) {
    if (error instanceof OauthClientError) {
      return errorResponse("invalid_client_metadata", error.message);
    }
    console.error("[oauth] registration failed:", error);
    return errorResponse("invalid_client_metadata", "Registration failed", 500);
  }
}

function errorResponse(error: string, description: string, status = 400) {
  return Response.json(
    { error, error_description: description },
    { status, headers: OAUTH_CORS_HEADERS },
  );
}

export function OPTIONS() {
  return corsPreflight();
}
