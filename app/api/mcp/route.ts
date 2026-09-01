import { createMcpHandler } from "mcp-handler";
import { authenticateMcpRequest } from "@/lib/mcp/auth";
import { registerMcpTools, MCP_SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";
import { baseUrl } from "@/lib/oauth/metadata";

export const maxDuration = 60;

/**
 * The Fluitplanner MCP server. Authenticates with a personal access token
 * (created by a planner under Settings) instead of the session cookie, so the
 * proxy skips this path — see lib/supabase/proxy.ts. The token binds every
 * tool call to one planner in one club; role and org checks run per request.
 */
async function handler(request: Request) {
  const ctx = await authenticateMcpRequest(request);
  if (!ctx) {
    return Response.json(
      {
        error: "unauthorized",
        message:
          "Provide a valid Fluitplanner MCP token as an 'Authorization: Bearer <token>' header. Planners can create one in the app under Settings.",
      },
      {
        status: 401,
        headers: {
          // resource_metadata points OAuth-capable clients (e.g. claude.ai)
          // at the discovery flow; header-capable clients can keep using
          // personal access tokens directly.
          "WWW-Authenticate": `Bearer realm="fluitplanner-mcp", error="invalid_token", resource_metadata="${baseUrl()}/.well-known/oauth-protected-resource"`,
        },
      },
    );
  }

  const mcp = createMcpHandler((server) => registerMcpTools(server, ctx), {
    serverInfo: { name: "fluitplanner", version: "1.0.0" },
    instructions: MCP_SERVER_INSTRUCTIONS,
  });
  return mcp(request);
}

export { handler as GET, handler as POST, handler as DELETE };
