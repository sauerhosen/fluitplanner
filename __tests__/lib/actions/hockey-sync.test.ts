import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockIsPlannerRole = vi.fn();
const mockSyncOrganizationMatches = vi.fn();
const mockClaimSyncSlot = vi.fn();
const mockReleaseSyncSlot = vi.fn();
const mockRevalidatePath = vi.fn();

const mockStateMaybeSingle = vi.fn();
const mockMatchesUpdate = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
  getTenantId: vi.fn(async () => "test-org-id"),
  getTenantSlug: vi.fn(async () => "test"),
  isRootDomain: vi.fn(async () => false),
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      update: mockMatchesUpdate,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: mockStateMaybeSingle }),
      }),
    })),
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: mockStateMaybeSingle }),
      }),
    })),
  })),
}));

vi.mock("@/lib/actions/organization-settings", () => ({
  isPlannerRole: mockIsPlannerRole,
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

beforeEach(() => {
  vi.resetAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  mockIsPlannerRole.mockResolvedValue(true);
  mockClaimSyncSlot.mockResolvedValue(true);
  mockReleaseSyncSlot.mockResolvedValue(undefined);
  mockStateMaybeSingle.mockResolvedValue({ data: null, error: null });
  mockSyncOrganizationMatches.mockResolvedValue({
    inserted: 2,
    updated: 1,
    flagged: 1,
    cancelled: 0,
    awaitingTime: 3,
    errors: [],
  });
});

describe("syncNow", () => {
  it("runs the engine for the current org and revalidates the matches page", async () => {
    const { syncNow } = await import("@/lib/actions/hockey-sync");
    const result = await syncNow();

    expect(mockClaimSyncSlot).toHaveBeenCalledWith(
      expect.anything(),
      "test-org-id",
      15 * 60 * 1000,
    );
    expect(mockSyncOrganizationMatches).toHaveBeenCalledWith(
      expect.objectContaining({ supabase: expect.anything() }),
      "test-org-id",
    );
    expect(result).toMatchObject({ status: "synced", inserted: 2 });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/protected/matches");
  });

  it("returns cooldown status when the sync slot is not claimed", async () => {
    mockClaimSyncSlot.mockResolvedValue(false);

    const { syncNow } = await import("@/lib/actions/hockey-sync");
    await expect(syncNow()).resolves.toEqual({ status: "cooldown" });
    expect(mockSyncOrganizationMatches).not.toHaveBeenCalled();
  });

  it("releases the lease after a successful run", async () => {
    const { syncNow } = await import("@/lib/actions/hockey-sync");
    await syncNow();
    expect(mockReleaseSyncSlot).toHaveBeenCalledWith(
      expect.anything(),
      "test-org-id",
    );
  });

  it("releases the lease when the engine throws", async () => {
    mockSyncOrganizationMatches.mockRejectedValue(new Error("engine boom"));

    const { syncNow } = await import("@/lib/actions/hockey-sync");
    await expect(syncNow()).rejects.toThrow("engine boom");
    expect(mockReleaseSyncSlot).toHaveBeenCalledWith(
      expect.anything(),
      "test-org-id",
    );
  });

  it("rejects non-planner users", async () => {
    mockIsPlannerRole.mockResolvedValue(false);
    const { syncNow } = await import("@/lib/actions/hockey-sync");
    await expect(syncNow()).rejects.toThrow("NOT_PLANNER");
    expect(mockSyncOrganizationMatches).not.toHaveBeenCalled();
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
    mockIsPlannerRole.mockResolvedValue(false);
    const { clearMatchReviewFlags } = await import("@/lib/actions/hockey-sync");
    await expect(clearMatchReviewFlags("m-1")).rejects.toThrow("NOT_PLANNER");
  });
});
