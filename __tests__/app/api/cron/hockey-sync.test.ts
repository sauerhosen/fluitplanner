import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSyncWithLease = vi.fn();
const mockRange = vi.fn();

vi.mock("@/lib/hockey/deps", () => ({
  createHockeyDeps: vi.fn(() => ({
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ range: mockRange }),
        }),
      })),
    },
    client: { get: vi.fn() },
  })),
}));

vi.mock("@/lib/hockey/sync", () => ({
  syncWithLease: mockSyncWithLease,
}));

function makeRequest(authorization?: string): Request {
  return new Request("http://localhost/api/cron/hockey-sync", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CRON_SECRET", "test-secret");
  mockRange.mockResolvedValue({
    data: [
      { organization_id: "org-1" },
      { organization_id: "org-2" },
      { organization_id: "org-1" }, // duplicate → deduped
    ],
    error: null,
  });
  mockSyncWithLease.mockResolvedValue({
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
    expect(mockSyncWithLease).not.toHaveBeenCalled();
  });

  it("returns 401 with a wrong secret", async () => {
    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer wrong"));
    expect(response.status).toBe(401);
  });

  it("runs a leased sync per org with the 6h skip window", async () => {
    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));

    expect(response.status).toBe(200);
    expect(mockSyncWithLease).toHaveBeenCalledTimes(2);
    expect(mockSyncWithLease).toHaveBeenCalledWith(
      expect.anything(),
      "org-1",
      6 * 60 * 60 * 1000,
    );
    const orgs = mockSyncWithLease.mock.calls.map(([, orgId]) => orgId);
    expect(orgs).toEqual(["org-1", "org-2"]);
  });

  it("pages through tracked_teams beyond the PostgREST row cap", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({
      organization_id: `org-${i}`,
    }));
    mockRange
      .mockResolvedValueOnce({ data: page, error: null })
      .mockResolvedValueOnce({
        data: [{ organization_id: "org-last" }],
        error: null,
      });
    mockSyncWithLease.mockResolvedValue(null); // all skipped, keep it fast

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));
    const body = await response.json();

    expect(mockRange).toHaveBeenCalledTimes(2);
    expect(mockRange).toHaveBeenNthCalledWith(1, 0, 999);
    expect(mockRange).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(body.organizations).toBe(1001);
  });

  it("continues with other orgs when one fails", async () => {
    mockSyncWithLease
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
    expect(mockSyncWithLease).toHaveBeenCalledTimes(2);
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({ error: "boom" });
    expect(body.results[1]).toMatchObject({ inserted: 3 });
  });

  it("reports orgs whose sync slot was not claimed as skipped", async () => {
    mockSyncWithLease
      .mockResolvedValueOnce(null) // org-1: synced recently
      .mockResolvedValueOnce({
        inserted: 0,
        updated: 0,
        flagged: 0,
        cancelled: 0,
        awaitingTime: 0,
        errors: [],
      });

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));
    const body = await response.json();

    expect(body.results).toContainEqual(
      expect.objectContaining({ organizationId: "org-1", skipped: true }),
    );
  });

  it("returns 500 when the org enumeration fails", async () => {
    mockRange.mockResolvedValue({ data: null, error: { message: "db down" } });

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));
    expect(response.status).toBe(500);
    expect(mockSyncWithLease).not.toHaveBeenCalled();
  });
});
