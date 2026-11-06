import { MCP_SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";

/**
 * Options for the MCP server behind /api/mcp.
 *
 * `listChanged: false` on tools and prompts matters for cost, not just accuracy. The SDK
 * defaults it to `true` once a tool (or prompt) is registered, and a `subscriptions/listen`
 * request for a capability the server advertises opens an SSE stream that
 * stays open, sending a keepalive every 15s, until the client disconnects. The
 * tool and prompt lists are fixed per deployment and this stateless handler has no event
 * bus across instances, so nothing ever arrives on that stream. On Vercel it
 * hung until maxDuration (60s), then the client reconnected — a timed-out
 * function every minute for as long as a client stayed connected. With nothing
 * advertised, the SDK acknowledges the listen and closes the stream at once.
 */
export const MCP_SERVER_OPTIONS = {
  serverInfo: { name: "fluitplanner", version: "1.0.0" },
  instructions: MCP_SERVER_INSTRUCTIONS,
  capabilities: {
    tools: { listChanged: false },
    prompts: { listChanged: false },
  },
};
