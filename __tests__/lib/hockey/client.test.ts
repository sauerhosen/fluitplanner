import { describe, it, expect, vi, afterEach } from "vitest";
import { createHockeyClient } from "@/lib/hockey/client";
import type { CredentialStore, HockeyCredentials } from "@/lib/hockey/types";

function makeMemoryStore(
  initial: HockeyCredentials | null = null,
): CredentialStore & { saved: HockeyCredentials[] } {
  let current = initial;
  const saved: HockeyCredentials[] = [];
  return {
    saved,
    async load() {
      return current;
    },
    async save(credentials) {
      current = credentials;
      saved.push(credentials);
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("createHockeyClient", () => {
  it("registers a device on first use and persists credentials", async () => {
    const store = makeMemoryStore();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { token: "tok-1" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [{ name: "SCHC" }] }));

    const client = createHockeyClient({ store, fetchFn });
    const clubs = await client.get<Array<{ name: string }>>("/clubs");

    expect(clubs).toEqual([{ name: "SCHC" }]);
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0].token).toBe("tok-1");

    // First call: registration
    const [registerUrl, registerInit] = fetchFn.mock.calls[0];
    expect(String(registerUrl)).toBe(
      "https://app.hockeyweerelt.nl/device/register",
    );
    expect(registerInit.method).toBe("POST");
    const registerBody = JSON.parse(registerInit.body);
    expect(registerBody.os).toBe("Web");
    expect(registerBody.uuid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("sends the signed X-HAPI headers on data requests", async () => {
    const store = makeMemoryStore({
      uuid: "12345678-abcd-4ef0-9876-0123456789ab",
      token: "tok-existing",
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }));

    const client = createHockeyClient({ store, fetchFn });
    await client.get("/clubs");

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe("https://app.hockeyweerelt.nl/clubs");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-HAPI-Authorization"]).toBe("tok-existing");
    expect(headers["X-HAPI-Version"]).toBe("7");
    expect(headers["X-HAPI-Timestamp"]).toMatch(/^\d+$/);
    expect(headers["X-HAPI-Signature"]).toMatch(/^[0-9a-f]{40}$/);
    expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
  });

  it("re-registers once and retries on 401", async () => {
    const store = makeMemoryStore({
      uuid: "12345678-abcd-4ef0-9876-0123456789ab",
      token: "tok-stale",
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "Unauthenticated" }))
      .mockResolvedValueOnce(jsonResponse(200, { token: "tok-fresh" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));

    const client = createHockeyClient({ store, fetchFn });
    const result = await client.get<{ ok: boolean }>("/clubs");

    expect(result).toEqual({ ok: true });
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(store.saved.at(-1)?.token).toBe("tok-fresh");
  });

  it("throws when the retry after re-registration also returns 401", async () => {
    const store = makeMemoryStore({
      uuid: "12345678-abcd-4ef0-9876-0123456789ab",
      token: "tok-stale",
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "Unauthenticated" }))
      .mockResolvedValueOnce(jsonResponse(200, { token: "tok-fresh" }))
      .mockResolvedValueOnce(jsonResponse(401, { message: "Unauthenticated" }));

    const client = createHockeyClient({ store, fetchFn });
    await expect(client.get("/clubs")).rejects.toThrow("Unauthenticated");
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it("throws the upstream message on non-401 errors without retrying", async () => {
    const store = makeMemoryStore({
      uuid: "12345678-abcd-4ef0-9876-0123456789ab",
      token: "tok",
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { message: "Server error" }));

    const client = createHockeyClient({ store, fetchFn });
    await expect(client.get("/clubs")).rejects.toThrow("Server error");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("throws when device registration fails", async () => {
    const store = makeMemoryStore();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { message: "nope" }));

    const client = createHockeyClient({ store, fetchFn });
    await expect(client.get("/clubs")).rejects.toThrow(
      "Device registration failed",
    );
  });

  it("logs a failed request with its endpoint and status, never the credentials", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = makeMemoryStore({
      uuid: "12345678-abcd-4ef0-9876-0123456789ab",
      token: "secret-token",
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(429, { message: "Too Many Attempts." }),
      );

    const client = createHockeyClient({ store, fetchFn });
    await expect(client.get("/poules/1/teams/2")).rejects.toThrow(
      "Too Many Attempts.",
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0].join(" "));
    expect(line).toContain("/poules/1/teams/2");
    expect(line).toContain("429");
    expect(line).toContain("Too Many Attempts.");
    expect(line).not.toContain("secret-token");
    expect(line).not.toContain("12345678-abcd");
    warn.mockRestore();
  });

  it("registers one device for concurrent first requests", async () => {
    const store = makeMemoryStore();
    const fetchFn = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith("/device/register")
        ? jsonResponse(200, { token: "tok-1" })
        : jsonResponse(200, { data: [] }),
    );

    const client = createHockeyClient({ store, fetchFn });
    await Promise.all([client.get("/a"), client.get("/b"), client.get("/c")]);

    const registrations = fetchFn.mock.calls.filter(([url]) =>
      String(url).endsWith("/device/register"),
    );
    expect(registrations).toHaveLength(1);
    expect(store.saved).toHaveLength(1);
  });

  it("re-registers once when concurrent requests all get a 401", async () => {
    const store = makeMemoryStore({
      uuid: "12345678-abcd-4ef0-9876-0123456789ab",
      token: "tok-stale",
    });
    const fetchFn = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith("/device/register")) {
          return jsonResponse(200, { token: "tok-fresh" });
        }
        const headers = init?.headers as Record<string, string>;
        return headers["X-HAPI-Authorization"] === "tok-fresh"
          ? jsonResponse(200, { data: { ok: true } })
          : jsonResponse(401, { message: "Unauthenticated" });
      },
    );

    const client = createHockeyClient({ store, fetchFn });
    const results = await Promise.all([
      client.get("/a"),
      client.get("/b"),
      client.get("/c"),
    ]);

    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    const registrations = fetchFn.mock.calls.filter(([url]) =>
      String(url).endsWith("/device/register"),
    );
    expect(registrations).toHaveLength(1);
    expect(store.saved.map((c) => c.token)).toEqual(["tok-fresh"]);
  });

  it("retries registration on the next request after one fails", async () => {
    const store = makeMemoryStore();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { message: "nope" }))
      .mockResolvedValueOnce(jsonResponse(200, { token: "tok-1" }))
      .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));

    const client = createHockeyClient({ store, fetchFn });
    await expect(client.get("/clubs")).rejects.toThrow(
      "Device registration failed",
    );
    await expect(client.get("/clubs")).resolves.toEqual({ ok: true });
  });

  it("logs a failed request whose body is not JSON", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = makeMemoryStore({
      uuid: "12345678-abcd-4ef0-9876-0123456789ab",
      token: "tok",
    });
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("<html>Bad Gateway</html>", { status: 502 }),
      );

    const client = createHockeyClient({ store, fetchFn });
    await expect(client.get("/poules/1")).rejects.toThrow("HTTP 502");

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0].join(" "));
    expect(line).toContain("/poules/1");
    expect(line).toContain("502");
    warn.mockRestore();
  });
  describe("rate limiting", () => {
    const creds = {
      uuid: "12345678-abcd-4ef0-9876-0123456789ab",
      token: "tok",
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    function throttled(headers: Record<string, string>): Response {
      return new Response(JSON.stringify({ message: "Too Many Attempts." }), {
        status: 429,
        headers: { "Content-Type": "application/json", ...headers },
      });
    }

    it("waits out Retry-After and retries when the wait ends before the deadline", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const sleep = vi.fn(async () => {});
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(throttled({ "Retry-After": "47" }))
        .mockResolvedValueOnce(jsonResponse(200, { data: { ok: true } }));

      const client = createHockeyClient({
        store: makeMemoryStore(creds),
        fetchFn,
        rateLimitDeadline: Date.now() + 120_000,
        sleep,
      });

      await expect(client.get("/clubs")).resolves.toEqual({ ok: true });
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(sleep).toHaveBeenCalledTimes(1);
      // Retry-After plus a small margin, never less than what was asked
      const waited = (sleep.mock.calls[0] as unknown as [number])[0];
      expect(waited).toBeGreaterThanOrEqual(47_000);
      expect(waited).toBeLessThan(50_000);
    });

    it("falls back to X-RateLimit-Reset when Retry-After is absent", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const sleep = vi.fn(async () => {});
      const resetAt = Math.floor(Date.now() / 1000) + 30;
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(
          throttled({ "X-RateLimit-Reset": String(resetAt) }),
        )
        .mockResolvedValueOnce(jsonResponse(200, { data: [] }));

      const client = createHockeyClient({
        store: makeMemoryStore(creds),
        fetchFn,
        rateLimitDeadline: Date.now() + 120_000,
        sleep,
      });

      await client.get("/clubs");
      const waited = (sleep.mock.calls[0] as unknown as [number])[0];
      expect(waited).toBeGreaterThan(25_000);
      expect(waited).toBeLessThanOrEqual(33_000);
    });

    it("throws without waiting when no deadline is set", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const sleep = vi.fn(async () => {});
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(throttled({ "Retry-After": "5" }));

      const client = createHockeyClient({
        store: makeMemoryStore(creds),
        fetchFn,
        sleep,
      });

      await expect(client.get("/clubs")).rejects.toThrow("Too Many Attempts.");
      expect(sleep).not.toHaveBeenCalled();
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("waits out a throttled device registration too", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const sleep = vi.fn(async () => {});
      const store = makeMemoryStore();
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(throttled({ "Retry-After": "20" }))
        .mockResolvedValueOnce(jsonResponse(200, { token: "tok-1" }))
        .mockResolvedValueOnce(jsonResponse(200, { data: [] }));

      const client = createHockeyClient({
        store,
        fetchFn,
        rateLimitDeadline: Date.now() + 60_000,
        sleep,
      });

      await expect(client.get("/clubs")).resolves.toEqual([]);
      expect(sleep).toHaveBeenCalledTimes(1);
      expect(store.saved[0].token).toBe("tok-1");
      expect(String(fetchFn.mock.calls[1][0])).toContain("/device/register");
    });

    it("does not wait past the deadline", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const sleep = vi.fn(async () => {});
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(throttled({ "Retry-After": "40" }));

      const client = createHockeyClient({
        store: makeMemoryStore(creds),
        fetchFn,
        rateLimitDeadline: Date.now() + 30_000,
        sleep,
      });

      await expect(client.get("/a")).rejects.toThrow("Too Many Attempts.");
      expect(sleep).not.toHaveBeenCalled();
    });

    it("fails locally, without calling upstream, while a known throttle lasts", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(throttled({ "Retry-After": "40" }))
        .mockImplementation(async () => jsonResponse(200, { data: 1 }));

      const client = createHockeyClient({
        store: makeMemoryStore(creds),
        fetchFn,
      });

      await expect(client.get("/a")).rejects.toThrow("Too Many Attempts.");
      await expect(client.get("/b")).rejects.toThrow("Too Many Attempts.");
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("sends again once the known throttle has passed", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const start = Date.now();
      const now = vi.spyOn(Date, "now").mockReturnValue(start);
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(throttled({ "Retry-After": "40" }))
        .mockImplementation(async () => jsonResponse(200, { data: 1 }));

      const client = createHockeyClient({
        store: makeMemoryStore(creds),
        fetchFn,
      });

      await expect(client.get("/a")).rejects.toThrow("Too Many Attempts.");
      now.mockReturnValue(start + 45_000);
      await expect(client.get("/b")).resolves.toBe(1);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });

    it("idles out a known throttle instead of failing when the deadline allows", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const sleep = vi.fn(async () => {});
      const fetchFn = vi
        .fn()
        .mockResolvedValueOnce(throttled({ "Retry-After": "40" }))
        .mockImplementation(async () => jsonResponse(200, { data: 1 }));

      const client = createHockeyClient({
        store: makeMemoryStore(creds),
        fetchFn,
        rateLimitDeadline: Date.now() + 120_000,
        sleep,
      });

      await expect(client.get("/a")).resolves.toBe(1);
      // The fake sleep does not advance the clock, so the throttle still
      // looks active: the next request idles rather than throwing.
      await expect(client.get("/b")).resolves.toBe(1);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });
  });
});
