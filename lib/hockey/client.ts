import { randomUUID } from "node:crypto";
import { API_BASE, buildSignature } from "./signature";
import type { CredentialStore, HockeyClient, HockeyCredentials } from "./types";

const REQUEST_TIMEOUT_MS = 10_000;

/** Added to an upstream rate-limit wait, so the retry lands after the reset. */
const RATE_LIMIT_MARGIN_MS = 1_000;

/** Assumed window when a 429 carries no Retry-After or reset header. */
const DEFAULT_RATE_LIMIT_WAIT_MS = 60_000;

/**
 * How long a 429 asks us to wait: Retry-After (seconds), else the
 * X-RateLimit-Reset epoch, else one assumed window.
 */
function rateLimitWaitMs(response: Response): number {
  // Number(null) is 0, so an absent header must not parse as "retry now".
  const retryAfter = Number(response.headers.get("retry-after") ?? NaN);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return retryAfter * 1000 + RATE_LIMIT_MARGIN_MS;
  }
  const resetAt = Number(response.headers.get("x-ratelimit-reset") ?? NaN);
  if (Number.isFinite(resetAt) && resetAt > 0) {
    return Math.max(0, resetAt * 1000 - Date.now()) + RATE_LIMIT_MARGIN_MS;
  }
  return DEFAULT_RATE_LIMIT_WAIT_MS;
}

/**
 * Signed transport for the unofficial Match Center API
 * (docs/hockey-match-center-api.md §5–6). Registers an anonymous device on
 * first use, signs every request, and re-registers once on 401.
 *
 * The upstream allows about five requests a minute and answers the rest with
 * 429. With `maxRateLimitWaitMs` set, a throttled request waits out the window
 * and retries, drawing on one budget shared by every request this client makes
 * (so a cron run cannot wait past its own deadline). Without it — interactive
 * callers, which cannot hang for a minute — a 429 throws straight away.
 * Never log the device uuid or token — the pair is an access credential.
 */
export function createHockeyClient(opts: {
  store: CredentialStore;
  fetchFn?: typeof fetch;
  /** Total time this client may spend waiting out rate limits (default 0). */
  maxRateLimitWaitMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): HockeyClient {
  const { store } = opts;
  const fetchFn = opts.fetchFn ?? fetch;
  const sleep =
    opts.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let waitBudgetMs = opts.maxRateLimitWaitMs ?? 0;
  // Shared, not awaited per caller: one client serves parallel requests
  // (loadClubDayFixtures), and each must not register a device of its own.
  let credentials: Promise<HockeyCredentials> | null = null;

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

  function share(
    load: () => Promise<HockeyCredentials>,
  ): Promise<HockeyCredentials> {
    const pending = load();
    credentials = pending;
    // A failure must not stick: the next request tries again.
    pending.catch(() => {
      if (credentials === pending) credentials = null;
    });
    return pending;
  }

  function ensureCredentials(): Promise<HockeyCredentials> {
    return (
      credentials ??
      share(async () => (await store.load()) ?? (await register()))
    );
  }

  /**
   * Replaces the credentials a request was rejected with. Parallel 401s on
   * the same credentials share one registration; a request whose credentials
   * were already replaced retries with the replacement.
   */
  function renewCredentials(
    rejected: Promise<HockeyCredentials>,
  ): Promise<HockeyCredentials> {
    if (credentials && credentials !== rejected) return credentials;
    return share(register);
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

  async function execute(
    endpoint: string,
    pending: Promise<HockeyCredentials>,
  ): Promise<Response> {
    const creds = await pending;
    return fetchFn(new URL(endpoint, API_BASE), {
      method: "GET",
      headers: signedHeaders(endpoint, creds),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }

  /** The upstream error message, if the failed response carries one. */
  async function errorMessage(response: Response): Promise<string | null> {
    try {
      const body = (await response.json()) as { message?: unknown };
      return typeof body?.message === "string" ? body.message : null;
    } catch {
      return null;
    }
  }

  return {
    async get<T>(endpoint: string): Promise<T> {
      const used = ensureCredentials();
      let response = await execute(endpoint, used);
      if (response.status === 401) {
        response = await execute(endpoint, renewCredentials(used));
      }
      while (response.status === 429) {
        const waitMs = rateLimitWaitMs(response);
        if (waitMs > waitBudgetMs) break;
        waitBudgetMs -= waitMs;
        await sleep(waitMs);
        response = await execute(endpoint, credentials ?? used);
      }
      if (!response.ok) {
        // Checked before parsing: a proxy error page or empty body must not
        // throw first and skip the log. The one trace of an upstream
        // failure: server actions hand the browser only a generic digest, so
        // without this a throttle ("Too Many Attempts.") is
        // indistinguishable from any other error.
        const message = await errorMessage(response);
        console.warn(
          `Match Center GET ${endpoint} failed: HTTP ${response.status} ${message ?? ""}`.trim(),
        );
        throw new Error(message ?? `HTTP ${response.status}`);
      }
      const payload = (await response.json()) as { data?: T };
      return payload.data as T;
    },
  };
}
