import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequirePlanner = vi.fn();
const mockRequireAuthContext = vi.fn();
const mockSyncWithLease = vi.fn();
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

vi.mock("@/lib/hockey/sync", () => ({
  syncWithLease: mockSyncWithLease,
}));

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
  mockSyncWithLease.mockResolvedValue({
    inserted: 2,
    updated: 1,
    flagged: 1,
    cancelled: 0,
    awaitingTime: 3,
    errors: [],
  });
});

describe("syncNow", () => {
  it("runs the leased sync for the current org and revalidates the matches page", async () => {
    const { syncNow } = await import("@/lib/actions/hockey-sync");
    const result = await syncNow();

    expect(mockSyncWithLease).toHaveBeenCalledWith(
      expect.objectContaining({ supabase: expect.anything() }),
      "test-org-id",
      15 * 60 * 1000,
    );
    expect(result).toMatchObject({ status: "synced", inserted: 2 });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/protected/matches");
  });

  it("returns cooldown status when the sync slot is not claimed", async () => {
    mockSyncWithLease.mockResolvedValue(null);

    const { syncNow } = await import("@/lib/actions/hockey-sync");
    await expect(syncNow()).resolves.toEqual({ status: "cooldown" });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("rejects non-planner users without syncing", async () => {
    mockRequirePlanner.mockRejectedValue(new Error("NOT_PLANNER"));
    const { syncNow } = await import("@/lib/actions/hockey-sync");
    await expect(syncNow()).rejects.toThrow("NOT_PLANNER");
    expect(mockSyncWithLease).not.toHaveBeenCalled();
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
