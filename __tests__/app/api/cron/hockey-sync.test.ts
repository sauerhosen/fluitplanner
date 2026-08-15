import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSyncOrganizationMatches = vi.fn();
const mockTrackedSelect = vi.fn();
const mockStateIn = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn((table: string) => ({
      select: vi.fn(() => {
        if (table === "tracked_teams") return mockTrackedSelect();
        return { in: mockStateIn };
      }),
    })),
  })),
}));

vi.mock("@/lib/hockey/sync", () => ({
  syncOrganizationMatches: mockSyncOrganizationMatches,
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
  mockStateIn.mockResolvedValue({ data: [], error: null });
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

  it("syncs each org with tracked teams exactly once", async () => {
    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));

    expect(response.status).toBe(200);
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
  });

  it("skips orgs synced within the last six hours", async () => {
    mockStateIn.mockResolvedValue({
      data: [
        {
          organization_id: "org-1",
          last_synced_at: new Date(Date.now() - 60 * 60_000).toISOString(),
        },
        {
          organization_id: "org-2",
          last_synced_at: new Date(Date.now() - 20 * 3600_000).toISOString(),
        },
      ],
      error: null,
    });

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
});
