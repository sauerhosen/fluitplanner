import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  generateSecret,
  sha256Hex,
  verifyPkceS256,
  ACCESS_TOKEN_PREFIX,
  REFRESH_TOKEN_PREFIX,
} from "@/lib/oauth/tokens";
import { isAllowedRedirectUri, isCimdClientId } from "@/lib/oauth/clients";

describe("verifyPkceS256", () => {
  const verifier = "a".repeat(43);
  const challenge = createHash("sha256").update(verifier).digest("base64url");

  it("accepts a matching verifier/challenge pair", () => {
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it("rejects a wrong verifier", () => {
    expect(verifyPkceS256("b".repeat(43), challenge)).toBe(false);
  });

  it("rejects verifiers outside the RFC 7636 charset/length", () => {
    expect(verifyPkceS256("too-short", challenge)).toBe(false);
    expect(verifyPkceS256("a".repeat(129), challenge)).toBe(false);
    expect(verifyPkceS256("a".repeat(42) + "!", challenge)).toBe(false);
  });
});

describe("secrets", () => {
  it("generates prefixed unique secrets with stable hashes", () => {
    const a = generateSecret(ACCESS_TOKEN_PREFIX);
    const b = generateSecret(REFRESH_TOKEN_PREFIX);
    expect(a.startsWith("fpa_")).toBe(true);
    expect(b.startsWith("fpr_")).toBe(true);
    expect(a).not.toBe(generateSecret(ACCESS_TOKEN_PREFIX));
    expect(sha256Hex(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(a)).toBe(sha256Hex(a));
  });
});

describe("isAllowedRedirectUri", () => {
  it("accepts https and loopback http only", () => {
    expect(
      isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback"),
    ).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:9999/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:1/cb")).toBe(true);
    expect(isAllowedRedirectUri("http://example.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("ftp://example.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
    expect(isAllowedRedirectUri("https://user:pw@example.com/cb")).toBe(false);
    expect(isAllowedRedirectUri("https://example.com/cb#frag")).toBe(false);
  });
});

describe("isCimdClientId", () => {
  it("requires an https URL (loopback http allowed for dev)", () => {
    expect(isCimdClientId("https://client.example/metadata.json")).toBe(true);
    expect(isCimdClientId("http://localhost:9999/client.json")).toBe(true);
    expect(isCimdClientId("http://example.com/client.json")).toBe(false);
    expect(isCimdClientId("fpd_abc")).toBe(false);
    expect(isCimdClientId("urn:example")).toBe(false);
  });
});
