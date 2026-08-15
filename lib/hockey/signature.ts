import { createHash } from "node:crypto";

export const API_BASE = "https://app.hockeyweerelt.nl";

/**
 * Sanitize an endpoint per the Match Center signing algorithm
 * (docs/hockey-match-center-api.md §5.3): the path keeps only letters,
 * digits, `-` and `/`; query pairs keep URL order, drop every character
 * except letters, digits, `-`, `/` and `=`, and are concatenated without
 * separators (so `filter[dateStart]=x` becomes `filterdateStart=x`).
 */
export function sanitizeForSignature(endpoint: string): {
  path: string;
  query: string;
} {
  const url = new URL(endpoint, API_BASE);
  const path = url.pathname.replace(/[^a-zA-Z0-9\-/]+/g, "");
  const query = Array.from(url.searchParams.entries())
    .filter(([key]) => key.length > 0)
    .map(([key, value]) => {
      const cleanKey = key.replace(/[^a-zA-Z0-9\-/=]+/g, "");
      const cleanValue = value.replace(/[^a-zA-Z0-9\-/=]+/g, "");
      return `${cleanKey}=${cleanValue}`;
    })
    .join("");
  return { path, query };
}

/** Lowercase SHA-1 hex of `timestamp + path + query + reversed uuid`. */
export function buildSignature(opts: {
  endpoint: string;
  uuid: string;
  timestamp: number;
}): string {
  const { path, query } = sanitizeForSignature(opts.endpoint);
  const reversedUuid = opts.uuid.split("").reverse().join("");
  const input = `${opts.timestamp}${path}${query}${reversedUuid}`;
  return createHash("sha1").update(input, "utf8").digest("hex");
}
