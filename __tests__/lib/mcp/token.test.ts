import { describe, it, expect } from "vitest";
import {
  generateMcpToken,
  hashMcpToken,
  MCP_TOKEN_PREFIX,
  MCP_TOKEN_DISPLAY_PREFIX_LENGTH,
} from "@/lib/mcp/token";

describe("generateMcpToken", () => {
  it("produces a prefixed token with matching hash and display prefix", () => {
    const { token, hash, prefix } = generateMcpToken();
    expect(token.startsWith(MCP_TOKEN_PREFIX)).toBe(true);
    expect(hash).toBe(hashMcpToken(token));
    expect(prefix).toBe(token.slice(0, MCP_TOKEN_DISPLAY_PREFIX_LENGTH));
    expect(prefix).not.toBe(token);
  });

  it("produces unique tokens", () => {
    const tokens = new Set(
      Array.from({ length: 50 }, () => generateMcpToken().token),
    );
    expect(tokens.size).toBe(50);
  });

  it("hash is a hex sha-256 digest and stable", () => {
    const hash = hashMcpToken("fpm_example");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashMcpToken("fpm_example")).toBe(hash);
    expect(hashMcpToken("fpm_other")).not.toBe(hash);
  });
});
