import {
  registerDcrClient,
  readCappedText,
  OauthClientError,
  OauthRateLimitError,
} from "@/lib/oauth/clients";
import { corsPreflight, OAUTH_CORS_HEADERS } from "@/lib/oauth/metadata";

const MAX_BODY_BYTES = 64 * 1024;

/** Dynamic Client Registration (RFC 7591) — public clients, PKCE only. */
export async function POST(request: Request) {
  // The endpoint is unauthenticated — bound what it will even parse. The
  // declared length rejects the obvious case for free; readCappedText then
  // enforces the cap while streaming, so an unlabeled or lying body can't
  // buffer past it either.
  const declaredLength = Number(request.headers.get("content-length"));
  if (declaredLength > MAX_BODY_BYTES) {
    return errorResponse("invalid_client_metadata", "Body too large");
  }
  let raw: string;
  try {
    raw = await readCappedText(request, MAX_BODY_BYTES, "Body");
  } catch (error) {
    if (error instanceof OauthClientError) {
      return errorResponse("invalid_client_metadata", "Body too large");
    }
    throw error;
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return errorResponse("invalid_client_metadata", "Body must be JSON");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return errorResponse(
      "invalid_client_metadata",
      "Body must be a JSON object",
    );
  }
  try {
    const metadata = await registerDcrClient(body);
    return Response.json(metadata, {
      status: 201,
      headers: OAUTH_CORS_HEADERS,
    });
  } catch (error) {
    if (error instanceof OauthRateLimitError) {
      return Response.json(
        { error: "rate_limited", error_description: error.message },
        {
          status: 429,
          headers: { ...OAUTH_CORS_HEADERS, "Retry-After": "3600" },
        },
      );
    }
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
