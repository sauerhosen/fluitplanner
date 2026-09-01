import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Secret material for the OAuth flow. Same rules as MCP personal access
 * tokens: recognizable prefixes, plaintext never stored, SHA-256 hashes in
 * the database.
 */

export const AUTHORIZATION_CODE_PREFIX = "fpc_";
export const ACCESS_TOKEN_PREFIX = "fpa_";
export const REFRESH_TOKEN_PREFIX = "fpr_";
export const DCR_CLIENT_ID_PREFIX = "fpd_";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
export const AUTHORIZATION_CODE_TTL_SECONDS = 10 * 60; // 10 minutes

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function generateSecret(prefix: string): string {
  return prefix + randomBytes(32).toString("base64url");
}

export function generateDcrClientId(): string {
  return DCR_CLIENT_ID_PREFIX + randomBytes(16).toString("base64url");
}

/**
 * RFC 7636 S256 verification: BASE64URL(SHA256(verifier)) must equal the
 * challenge stored at authorize time. The verifier charset/length check is
 * part of the spec; comparison is constant-time.
 */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const digest = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(digest);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
