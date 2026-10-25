import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRefresh = vi.fn();
const mockRange = vi.fn();
const mockStateRange = vi.fn();

vi.mock("@/lib/hockey/deps", () => ({
  createHockeyDeps: vi.fn(() => ({
    supabase: {
      from: vi.fn((table: string) => ({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            range: table === "tracked_teams" ? mockRange : mockStateRange,
          }),
        }),
      })),
    },
    client: { get: vi.fn() },
  })),
}));

vi.mock("@/lib/hockey/refresh", () => ({
  refreshOrganization: mockRefresh,
}));

const syncResult = (overrides: Record<string, unknown> = {}) => ({
  inserted: 0,
  updated: 0,
  flagged: 0,
  cancelled: 0,
  awaitingTime: 0,
  errors: [],
  ...overrides,
});

const refreshed = (
  sync: Record<string, unknown> | null,
  detector: Record<string, unknown> | null = null,
) => ({ status: "refreshed", detector, sync });

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
  mockStateRange.mockResolvedValue({ data: [], error: null });
  mockRefresh.mockResolvedValue(refreshed(syncResult({ inserted: 1 })));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/hockey-sync", () => {
  it("returns 401 without the cron secret", async () => {
    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest());
    expect(response.status).toBe(401);
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  it("returns 401 with a wrong secret", async () => {
    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer wrong"));
    expect(response.status).toBe(401);
  });

  it("refreshes each org with the 6h full-sync skip window", async () => {
    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));

    expect(response.status).toBe(200);
    expect(mockRefresh).toHaveBeenCalledTimes(2);
    expect(mockRefresh).toHaveBeenCalledWith(expect.anything(), "org-1", {
      fullSyncWindowMs: 6 * 60 * 60 * 1000,
    });
    const orgs = mockRefresh.mock.calls.map(([, orgId]) => orgId);
    expect(orgs).toEqual(["org-1", "org-2"]);
  });

  it("lets the Match Center client wait out rate limits until a deadline inside maxDuration", async () => {
    const before = Date.now();
    const { createHockeyDeps } = await import("@/lib/hockey/deps");
    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    await GET(makeRequest("Bearer test-secret"));

    expect(createHockeyDeps).toHaveBeenCalledTimes(1);
    const [options] = vi.mocked(createHockeyDeps).mock.calls[0] as unknown as [
      { rateLimitDeadline: number },
    ];
    const allowedMs = options.rateLimitDeadline - before;
    expect(allowedMs).toBeGreaterThan(120_000);
    // leaves headroom under maxDuration (300s) for the last fetches and writes
    expect(allowedMs).toBeLessThanOrEqual(250_000);
  });

  it("starts no further org once the deadline has passed", async () => {
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    mockRefresh.mockImplementationOnce(async () => {
      now.mockReturnValue(start + 280_000); // org-1 used up the run
      return refreshed(syncResult());
    });

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));
    const body = await response.json();

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(body.results).toContainEqual(
      expect.objectContaining({ organizationId: "org-2", skipped: true }),
    );
    now.mockRestore();
  });

  it("processes orgs whose last run failed or was partial before the rest", async () => {
    mockStateRange.mockResolvedValue({
      data: [
        {
          organization_id: "org-1",
          last_synced_at: "2026-08-01T00:00:00Z", // stalest, but succeeded
          last_sync_status: "success",
        },
        {
          organization_id: "org-2",
          last_synced_at: "2026-08-15T00:00:00Z",
          last_sync_status: "partial", // throttled last night → first
        },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    await GET(makeRequest("Bearer test-secret"));

    const orgs = mockRefresh.mock.calls.map(([, orgId]) => orgId);
    expect(orgs).toEqual(["org-2", "org-1"]);
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
    mockRefresh.mockResolvedValue({ status: "busy" }); // all skipped, keep it fast

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));
    const body = await response.json();

    expect(mockRange).toHaveBeenCalledTimes(2);
    expect(mockRange).toHaveBeenNthCalledWith(1, 0, 999);
    expect(mockRange).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(body.organizations).toBe(1001);
  });

  it("continues with other orgs when one fails", async () => {
    mockRefresh
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(refreshed(syncResult({ inserted: 3 })));

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockRefresh).toHaveBeenCalledTimes(2);
    expect(body.results).toHaveLength(2);
    expect(body.results[0]).toMatchObject({ error: "boom" });
    expect(body.results[1]).toMatchObject({ inserted: 3 });
  });

  it("reports orgs whose lease was taken as skipped", async () => {
    mockRefresh
      .mockResolvedValueOnce({ status: "busy" }) // org-1: another run holds it
      .mockResolvedValueOnce(refreshed(syncResult()));

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));
    const body = await response.json();

    expect(body.results).toContainEqual(
      expect.objectContaining({ organizationId: "org-1", skipped: true }),
    );
  });

  it("reports an org synced within the window as skipped, with its detector run", async () => {
    const detector = { feeds: 1, polled: 1, suspects: 2, confirmed: 2 };
    mockRefresh
      .mockResolvedValueOnce(refreshed(null, detector)) // org-1: synced recently
      .mockResolvedValueOnce(refreshed(syncResult({ inserted: 2 })));

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));
    const body = await response.json();

    expect(body.results).toEqual([
      { organizationId: "org-1", skipped: true, detector },
      expect.objectContaining({ organizationId: "org-2", inserted: 2 }),
    ]);
    expect(body.results[1]).not.toHaveProperty("detector");
  });

  it("processes the stalest org first", async () => {
    mockStateRange.mockResolvedValue({
      data: [
        {
          organization_id: "org-1",
          last_synced_at: "2026-08-15T00:00:00Z",
        },
        {
          organization_id: "org-2",
          last_synced_at: "2026-08-01T00:00:00Z", // stalest → first
        },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    await GET(makeRequest("Bearer test-secret"));

    const orgs = mockRefresh.mock.calls.map(([, orgId]) => orgId);
    expect(orgs).toEqual(["org-2", "org-1"]);
  });

  it("returns 500 when the org enumeration fails", async () => {
    mockRange.mockResolvedValue({ data: null, error: { message: "db down" } });

    const { GET } = await import("@/app/api/cron/hockey-sync/route");
    const response = await GET(makeRequest("Bearer test-secret"));
    expect(response.status).toBe(500);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
