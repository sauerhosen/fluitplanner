import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSyncOrganizationMatches = vi.fn();
const mockClaimSyncSlot = vi.fn();
const mockReleaseSyncSlot = vi.fn();
const mockTrackedSelect = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => mockTrackedSelect()),
    })),
  })),
}));

vi.mock("@/lib/hockey/sync", () => ({
  syncOrganizationMatches: mockSyncOrganizationMatches,
  claimSyncSlot: mockClaimSyncSlot,
  releaseSyncSlot: mockReleaseSyncSlot,
}));

vi.mock("@/lib/hockey/client", () => ({
  createHockeyClient: vi.fn(() => ({ get: vi.fn() })),
}));

vi.mock("@/lib/hockey/credential-store", () => ({
  createDbCredentialStore: vi.fn(() => ({})),
}));

function makeRequest(authorization?: string): Request {
  return new Request("http://localhost/api/cron/hockey-sync", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  mockTrackedSelect.mockResolvedValue({
    data: [
      { organization_id: "org-1" },
      { organization_id: "org-2" },
      { organization_id: "org-1" }, // duplicate → deduped
    ],
    error: null,
  });
  mockClaimSyncSlot.mockResolvedValue("lease-token");
  mockReleaseSyncSlot.mockResolvedValue(undefined);
  mockSyncOrganizationMatches.mockResolvedValue({
    inserted: 1,
    updated: 0,
    flagged: 0,
    cancelled: 0,
    awaitingTime: 0,
    errors: [],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/hockey-sync", () => {
  it("returns 401 without the cron secret", async () => {
    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect(mockSyncOrganizationMatches).not.toHaveBeenCalled();
  });

  it("returns 401 with a wrong secret", async () => {
    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer wrong"));
    expect(response.status).toBe(401);
  });

  it("claims a slot and syncs each org with tracked teams exactly once", async () => {
    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));

    expect(response.status).toBe(200);
    expect(mockClaimSyncSlot).toHaveBeenCalledTimes(2);
    expect(mockSyncOrganizationMatches).toHaveBeenCalledTimes(2);
    const orgs = mockSyncOrganizationMatches.mock.calls.map(
      ([, orgId]) => orgId,
    );
    expect(orgs).toEqual(["org-1", "org-2"]);
  });

  it("continues with other orgs when one fails", async () => {
    mockSyncOrganizationMatches
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        inserted: 3,
        updated: 0,
        flagged: 0,
        cancelled: 0,
        awaitingTime: 0,
        errors: [],
      });

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockSyncOrganizationMatches).toHaveBeenCalledTimes(2);
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({ error: "boom" });
    expect(body.results[1]).toMatchObject({ inserted: 3 });
    // the failed org's lease is still released
    expect(mockReleaseSyncSlot).toHaveBeenCalledTimes(2);
  });

  it("skips orgs whose sync slot cannot be claimed", async () => {
    mockClaimSyncSlot
      .mockResolvedValueOnce(null) // org-1: synced recently
      .mockResolvedValueOnce("lease-token");

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));
    const body = await response.json();

    expect(mockSyncOrganizationMatches).toHaveBeenCalledTimes(1);
    expect(mockSyncOrganizationMatches).toHaveBeenCalledWith(
      expect.anything(),
      "org-2",
    );
    expect(body.results).toContainEqual(
      expect.objectContaining({ organizationId: "org-1", skipped: true }),
    );
  });

  it("records an error and continues when claiming a slot fails", async () => {
    mockClaimSyncSlot
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce("lease-token");

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));
    const body = await response.json();

    // Fails closed: the org with the failed claim is not synced
    expect(mockSyncOrganizationMatches).toHaveBeenCalledTimes(1);
    expect(body.results[0]).toMatchObject({
      organizationId: "org-1",
      error: "db down",
    });
  });
});
