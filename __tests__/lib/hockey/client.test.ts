import { describe, it, expect, vi } from "vitest";
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
});
