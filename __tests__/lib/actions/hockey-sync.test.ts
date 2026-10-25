import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequirePlanner = vi.fn();
const mockRequireAuthContext = vi.fn();
const mockRefresh = vi.fn();
const mockRevalidatePath = vi.fn();

const mockStateMaybeSingle = vi.fn();
const mockMatchesUpdate = vi.fn();

const userSupabase = {
  from: vi.fn(() => ({
    update: mockMatchesUpdate,
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ maybeSingle: mockStateMaybeSingle }),
    }),
  })),
};

vi.mock("@/lib/auth", () => ({
  requirePlanner: mockRequirePlanner,
  requireAuthContext: mockRequireAuthContext,
}));

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/hockey/deps", () => ({
  createHockeyDeps: vi.fn(() => ({
    supabase: { service: true },
    client: { get: vi.fn() },
  })),
}));

vi.mock("@/lib/hockey/refresh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hockey/refresh")>()),
  refreshOrganization: mockRefresh,
}));

const SYNC_RESULT = {
  inserted: 2,
  updated: 1,
  flagged: 1,
  cancelled: 0,
  awaitingTime: 3,
  errors: [],
};

const detectorResult = (overrides: Record<string, unknown> = {}) => ({
  feeds: 1,
  polled: 1,
  suspects: 0,
  confirmed: 0,
  pending: 0,
  shadowed: 0,
  inserted: 0,
  updated: 0,
  flagged: 0,
  cancelled: 0,
  errors: [],
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  mockRequirePlanner.mockResolvedValue({
    supabase: userSupabase,
    user: { id: "user-1" },
    tenantId: "test-org-id",
  });
  mockRequireAuthContext.mockResolvedValue({
    supabase: userSupabase,
    user: { id: "user-1" },
  });
  mockStateMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockRefresh.mockResolvedValue({
    status: "refreshed",
    detector: null,
    sync: SYNC_RESULT,
  });
});

describe("syncNow", () => {
  it("refreshes the current org with the 15-minute full-sync window and revalidates", async () => {
    const { syncNow } = await import("@/lib/actions/hockey-sync");
    const result = await syncNow();

    expect(mockRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ supabase: expect.anything() }),
      "test-org-id",
      { fullSyncWindowMs: 15 * 60 * 1000 },
    );
    expect(result).toEqual({
      status: "refreshed",
      detector: null,
      sync: SYNC_RESULT,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/protected/matches");
  });

  it("returns cooldown when inside the window and the org has no feeds", async () => {
    mockRefresh.mockResolvedValue({
      status: "refreshed",
      detector: null,
      sync: null,
    });

    const { syncNow } = await import("@/lib/actions/hockey-sync");
    await expect(syncNow()).resolves.toEqual({ status: "cooldown" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("returns cooldown when inside the window and the feeds showed no change", async () => {
    mockRefresh.mockResolvedValue({
      status: "refreshed",
      detector: detectorResult(),
      sync: null,
    });

    const { syncNow } = await import("@/lib/actions/hockey-sync");
    await expect(syncNow()).resolves.toEqual({ status: "cooldown" });
  });

  it("reports detector errors inside the cooldown instead of hiding them", async () => {
    const detector = detectorResult({ errors: ["www.club.nl: HTTP 503"] });
    mockRefresh.mockResolvedValue({
      status: "refreshed",
      detector,
      sync: null,
    });

    const { syncNow } = await import("@/lib/actions/hockey-sync");
    await expect(syncNow()).resolves.toEqual({
      status: "refreshed",
      detector,
      sync: null,
    });
  });

  it("reports the detector's work inside the cooldown", async () => {
    const detector = detectorResult({ suspects: 2, confirmed: 2, updated: 1 });
    mockRefresh.mockResolvedValue({
      status: "refreshed",
      detector,
      sync: null,
    });

    const { syncNow } = await import("@/lib/actions/hockey-sync");
    await expect(syncNow()).resolves.toEqual({
      status: "refreshed",
      detector,
      sync: null,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/protected/matches");
  });

  it("returns busy when another refresh holds the lease", async () => {
    mockRefresh.mockResolvedValue({ status: "busy" });

    const { syncNow } = await import("@/lib/actions/hockey-sync");
    await expect(syncNow()).resolves.toEqual({ status: "busy" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects non-planner users without syncing", async () => {
    mockRequirePlanner.mockRejectedValue(new Error("NOT_PLANNER"));
    const { syncNow } = await import("@/lib/actions/hockey-sync");
    await expect(syncNow()).rejects.toThrow("NOT_PLANNER");
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe("clearMatchReviewFlags", () => {
  it("clears the flags scoped to the current org", async () => {
    const mockEqOrg = vi.fn().mockResolvedValue({ error: null });
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqOrg });
    mockMatchesUpdate.mockReturnValue({ eq: mockEqId });

    const { clearMatchReviewFlags } = await import("@/lib/actions/hockey-sync");
    await clearMatchReviewFlags("m-1");

    expect(mockMatchesUpdate).toHaveBeenCalledWith({
      needs_review: false,
      review_reasons: [],
    });
    expect(mockEqId).toHaveBeenCalledWith("id", "m-1");
    expect(mockEqOrg).toHaveBeenCalledWith("organization_id", "test-org-id");
  });

  it("rejects non-planner users", async () => {
    mockRequirePlanner.mockRejectedValue(new Error("NOT_PLANNER"));
    const { clearMatchReviewFlags } = await import("@/lib/actions/hockey-sync");
    await expect(clearMatchReviewFlags("m-1")).rejects.toThrow("NOT_PLANNER");
  });
});
