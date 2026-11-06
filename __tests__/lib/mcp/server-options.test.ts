import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/server";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { MCP_SERVER_OPTIONS } from "@/lib/mcp/server-options";
import { registerMcpTools } from "@/lib/mcp/tools";

const ctx = {
  tokenId: "t",
  userId: "u",
  organizationId: "o",
  organizationName: "Club",
  organizationSlug: "club",
};

function buildServer() {
  const { serverInfo, ...options } = MCP_SERVER_OPTIONS;
  const server = new McpServer(serverInfo, options);
  registerMcpTools(server, ctx);
  return server;
}

describe("MCP_SERVER_OPTIONS", () => {
  // The SDK holds a `subscriptions/listen` stream open for every
  // list-changed capability the server advertises. The tool list is fixed per
  // deployment, so nothing would ever arrive on it — and on Vercel the stream
  // hung until the 60s maxDuration, then the client reconnected.
  it("advertises no list-changed notifications, so listen streams close at once", () => {
    const caps = buildServer().server.getCapabilities();
    expect(caps.tools).toBeDefined();
    expect(caps.tools?.listChanged).toBe(false);
    expect(caps.resources?.listChanged).not.toBe(true);
    expect(caps.prompts?.listChanged).not.toBe(true);
  });

  it("keeps the server identity and instructions", () => {
    expect(MCP_SERVER_OPTIONS.serverInfo.name).toBe("fluitplanner");
    expect(MCP_SERVER_OPTIONS.instructions).toMatch(/Fluitplanner/);
  });
});
