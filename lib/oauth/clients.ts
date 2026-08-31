import { createServiceClient } from "@/lib/supabase/service";
import { generateDcrClientId, DCR_CLIENT_ID_PREFIX } from "@/lib/oauth/tokens";

export type OauthClient = {
  client_id: string;
  kind: "dcr" | "cimd";
  client_name: string | null;
  client_uri: string | null;
  logo_uri: string | null;
  redirect_uris: string[];
};

/** Client-facing validation errors (safe to echo in an OAuth error response). */
export class OauthClientError extends Error {}

const MAX_REDIRECT_URIS = 10;
const CIMD_FETCH_TIMEOUT_MS = 5_000;
const CIMD_MAX_BYTES = 64 * 1024;
/** How long a fetched CIMD document is trusted before refetching. */
const CIMD_CACHE_MS = 60 * 60 * 1000;

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Hosts our server must never fetch a CIMD document from in production:
 * loopback and IP literals point at ourselves or the internal network, not
 * at a public client's published metadata. (Public DNS names that resolve to
 * internal addresses remain a residual risk, bounded by the https
 * requirement, no-redirect fetch, timeout, and size cap.)
 */
function isForbiddenCimdHost(hostname: string): boolean {
  if (isLoopbackHost(hostname) || hostname.endsWith(".localhost")) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true; // IPv4 literal
  if (hostname.startsWith("[")) return true; // IPv6 literal
  return false;
}

/** https everywhere; plain http only for loopback (local dev tooling). */
export function isAllowedRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.username || u.password || u.hash) return false;
    if (u.protocol === "https:") return true;
    return u.protocol === "http:" && isLoopbackHost(u.hostname);
  } catch {
    return false;
  }
}

function validateRedirectUris(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new OauthClientError("redirect_uris must be a non-empty array");
  }
  if (value.length > MAX_REDIRECT_URIS) {
    throw new OauthClientError(
      `At most ${MAX_REDIRECT_URIS} redirect_uris are allowed`,
    );
  }
  const uris = value.map((v) => {
    if (typeof v !== "string" || !isAllowedRedirectUri(v)) {
      throw new OauthClientError(
        `Invalid redirect_uri: ${typeof v === "string" ? v : "(not a string)"} — https is required (http only for localhost)`,
      );
    }
    return v;
  });
  return [...new Set(uris)];
}

function optionalString(value: unknown, max = 300): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : null;
}

/**
 * Dynamic Client Registration (RFC 7591), public clients only — token
 * requests authenticate with PKCE, not a client secret.
 */
export async function registerDcrClient(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const redirectUris = validateRedirectUris(body.redirect_uris);
  const clientId = generateDcrClientId();
  const row = {
    client_id: clientId,
    kind: "dcr",
    client_name: optionalString(body.client_name),
    client_uri: optionalString(body.client_uri),
    logo_uri: optionalString(body.logo_uri),
    redirect_uris: redirectUris,
    metadata: body,
  };
  const { error } = await createServiceClient()
    .from("oauth_clients")
    .insert(row);
  if (error) throw new Error(error.message);

  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: row.client_name ?? undefined,
    client_uri: row.client_uri ?? undefined,
    logo_uri: row.logo_uri ?? undefined,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  };
}

/**
 * A CIMD client_id must be an HTTPS URL. Our server fetches it, so in
 * production loopback/IP-literal hosts are rejected outright; outside
 * production loopback http is allowed for local testing.
 */
export function isCimdClientId(clientId: string): boolean {
  try {
    const u = new URL(clientId);
    if (u.username || u.password) return false;
    if (u.protocol === "https:") {
      return !(isProduction() && isForbiddenCimdHost(u.hostname));
    }
    return (
      u.protocol === "http:" && isLoopbackHost(u.hostname) && !isProduction()
    );
  } catch {
    return false;
  }
}

/**
 * Read a response body without buffering past the size cap: count bytes as
 * chunks arrive and cancel the stream the moment the limit is exceeded, so a
 * hostile endpoint cannot force an oversized allocation.
 */
async function readBodyCapped(res: Response): Promise<string> {
  if (!res.body) {
    const text = await res.text();
    if (text.length > CIMD_MAX_BYTES) {
      throw new OauthClientError("Client metadata document is too large");
    }
    return text;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > CIMD_MAX_BYTES) {
      await reader.cancel();
      throw new OauthClientError("Client metadata document is too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function fetchCimdDocument(url: string): Promise<{
  client_name: string | null;
  client_uri: string | null;
  logo_uri: string | null;
  redirect_uris: string[];
  raw: Record<string, unknown>;
}> {
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(CIMD_FETCH_TIMEOUT_MS),
      headers: { accept: "application/json" },
    });
  } catch {
    throw new OauthClientError(
      "Could not fetch the client metadata document (client_id URL)",
    );
  }
  if (!res.ok) {
    throw new OauthClientError(
      `Client metadata document returned HTTP ${res.status}`,
    );
  }
  const text = await readBodyCapped(res);
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new OauthClientError("Client metadata document is not valid JSON");
  }
  if (typeof doc.client_id === "string" && doc.client_id !== url) {
    throw new OauthClientError(
      "Client metadata document's client_id does not match its URL",
    );
  }
  return {
    client_name: optionalString(doc.client_name),
    client_uri: optionalString(doc.client_uri),
    logo_uri: optionalString(doc.logo_uri),
    redirect_uris: validateRedirectUris(doc.redirect_uris),
    raw: doc,
  };
}

/**
 * Resolve a client_id to a validated client: a stored DCR registration, or a
 * CIMD document fetched from the client_id URL (cached briefly in
 * oauth_clients so authorize and token requests agree on what was approved).
 */
export async function getClient(clientId: string): Promise<OauthClient | null> {
  const db = createServiceClient();

  if (clientId.startsWith(DCR_CLIENT_ID_PREFIX)) {
    const { data, error } = await db
      .from("oauth_clients")
      .select(
        "client_id, kind, client_name, client_uri, logo_uri, redirect_uris",
      )
      .eq("client_id", clientId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as OauthClient | null) ?? null;
  }

  if (!isCimdClientId(clientId)) return null;

  const { data: cached, error: cacheError } = await db
    .from("oauth_clients")
    .select(
      "client_id, kind, client_name, client_uri, logo_uri, redirect_uris, updated_at",
    )
    .eq("client_id", clientId)
    .maybeSingle();
  if (cacheError) throw new Error(cacheError.message);
  if (
    cached &&
    Date.now() - new Date(cached.updated_at as string).getTime() < CIMD_CACHE_MS
  ) {
    return cached as unknown as OauthClient;
  }

  const doc = await fetchCimdDocument(clientId);
  const row = {
    client_id: clientId,
    kind: "cimd",
    client_name: doc.client_name,
    client_uri: doc.client_uri,
    logo_uri: doc.logo_uri,
    redirect_uris: doc.redirect_uris,
    metadata: doc.raw,
    updated_at: new Date().toISOString(),
  };
  const { error } = await db
    .from("oauth_clients")
    .upsert(row, { onConflict: "client_id" });
  if (error) throw new Error(error.message);
  return {
    client_id: clientId,
    kind: "cimd",
    client_name: doc.client_name,
    client_uri: doc.client_uri,
    logo_uri: doc.logo_uri,
    redirect_uris: doc.redirect_uris,
  };
}
