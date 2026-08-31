import { createHash, randomBytes } from "node:crypto";

/**
 * Recognizable prefix so a leaked token is identifiable in scanners and the
 * bearer parser can reject non-token values before hitting the database.
 */
export const MCP_TOKEN_PREFIX = "fpm_";

/** Characters of the plaintext shown in the UI to tell tokens apart. */
export const MCP_TOKEN_DISPLAY_PREFIX_LENGTH = 12;

export type GeneratedMcpToken = {
  /** Plaintext token — shown to the user once, never stored. */
  token: string;
  /** SHA-256 hex digest, the only thing persisted. */
  hash: string;
  /** Display prefix persisted alongside the hash. */
  prefix: string;
};

export function generateMcpToken(): GeneratedMcpToken {
  const token = MCP_TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashMcpToken(token),
    prefix: token.slice(0, MCP_TOKEN_DISPLAY_PREFIX_LENGTH),
  };
}

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
