import { createMcpHandler } from "mcp-handler";
import { authenticateMcpRequest } from "@/lib/mcp/auth";
import { registerMcpTools, MCP_SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";

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
          "WWW-Authenticate":
            'Bearer realm="fluitplanner-mcp", error="invalid_token"',
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
