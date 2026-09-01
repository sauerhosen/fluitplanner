import { describe, it, expect, vi, afterEach } from "vitest";
import { baseUrl, mcpResourceUrl } from "@/lib/oauth/metadata";

afterEach(() => vi.unstubAllEnvs());

describe("baseUrl env hygiene", () => {
  it("trims whitespace from NEXT_PUBLIC_SITE_URL", () => {
    // A trailing newline (the `echo … | vercel env add` classic) reached
    // production and made WWW-Authenticate header construction throw,
    // turning every unauthenticated MCP request into a 500.
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.fluiten.org\n");
    expect(baseUrl()).toBe("https://www.fluiten.org");
    expect(mcpResourceUrl()).toBe("https://www.fluiten.org/api/mcp");
  });

  it("strips a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.fluiten.org/");
    expect(baseUrl()).toBe("https://www.fluiten.org");
  });

  it("handles both at once and leaves clean values alone", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", " https://www.fluiten.org/\n");
    expect(baseUrl()).toBe("https://www.fluiten.org");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.fluiten.org");
    expect(baseUrl()).toBe("https://www.fluiten.org");
  });

  it("produces a value safe for HTTP header construction", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.fluiten.org\n");
    expect(
      () =>
        new Response(null, {
          status: 401,
          headers: {
            "WWW-Authenticate": `Bearer resource_metadata="${baseUrl()}/.well-known/oauth-protected-resource"`,
          },
        }),
    ).not.toThrow();
  });
});
