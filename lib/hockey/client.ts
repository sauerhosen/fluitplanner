import { randomUUID } from "node:crypto";
import { API_BASE, buildSignature } from "./signature";
import type { CredentialStore, HockeyClient, HockeyCredentials } from "./types";

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Signed transport for the unofficial Match Center API
 * (docs/hockey-match-center-api.md §5–6). Registers an anonymous device on
 * first use, signs every request, and re-registers once on 401.
 * Never log the device uuid or token — the pair is an access credential.
 */
export function createHockeyClient(opts: {
  store: CredentialStore;
  fetchFn?: typeof fetch;
}): HockeyClient {
  const { store } = opts;
  const fetchFn = opts.fetchFn ?? fetch;
  let credentials: HockeyCredentials | null = null;

  async function register(): Promise<HockeyCredentials> {
    const uuid = randomUUID();
    const response = await fetchFn(`${API_BASE}/device/register`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({ uuid, os: "Web" }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Device registration failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as { token?: string };
    if (!body.token) {
      throw new Error("Device registration failed: no token in response");
    }
    const fresh = { uuid, token: body.token };
    await store.save(fresh);
    return fresh;
  }

  async function ensureCredentials(): Promise<HockeyCredentials> {
    if (credentials) return credentials;
    credentials = (await store.load()) ?? (await register());
    return credentials;
  }

  function signedHeaders(
    endpoint: string,
    creds: HockeyCredentials,
  ): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "X-HAPI-Authorization": creds.token,
      "X-HAPI-Timestamp": String(timestamp),
      "X-HAPI-Signature": buildSignature({
        endpoint,
        uuid: creds.uuid,
        timestamp,
      }),
      "X-HAPI-Version": "7",
    };
  }

  async function execute(endpoint: string): Promise<Response> {
    const creds = await ensureCredentials();
    return fetchFn(new URL(endpoint, API_BASE), {
      method: "GET",
      headers: signedHeaders(endpoint, creds),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  return {
    async get<T>(endpoint: string): Promise<T> {
      let response = await execute(endpoint);
      if (response.status === 401) {
        credentials = await register();
        response = await execute(endpoint);
      }
      const payload = (await response.json()) as {
        data?: T;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message ?? `HTTP ${response.status}`);
      }
      return payload.data as T;
    },
  };
}
