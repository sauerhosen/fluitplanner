import { describe, it, expect, vi, beforeEach } from "vitest";

const mockWatchClubFeeds = vi.fn();
vi.mock("@/lib/club-feed/watch", async () => {
  const actual = await vi.importActual<typeof import("@/lib/club-feed/watch")>(
    "@/lib/club-feed/watch",
  );
  return { ...actual, watchClubFeeds: mockWatchClubFeeds };
});

const mockClaimSyncSlot = vi.fn();
const mockReleaseSyncSlot = vi.fn();
const mockSyncOrganizationMatches = vi.fn();
vi.mock("@/lib/hockey/sync", async () => ({
  withinCooldown: (
    await vi.importActual<typeof import("@/lib/hockey/sync")>(
      "@/lib/hockey/sync",
    )
  ).withinCooldown,
  claimSyncSlot: mockClaimSyncSlot,
  releaseSyncSlot: mockReleaseSyncSlot,
  syncOrganizationMatches: mockSyncOrganizationMatches,
}));

const ORG = "org-1";
const LEASE = "2026-10-25T10:10:00.000Z";
const WINDOW_MS = 15 * 60 * 1000;

const mockStateMaybeSingle = vi.fn();
const supabase = {
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({ maybeSingle: mockStateMaybeSingle })),
    })),
  })),
};
const deps = { supabase: supabase as never, client: { get: vi.fn() } };

const syncResult = {
  inserted: 1,
  updated: 0,
  flagged: 0,
  cancelled: 0,
  awaitingTime: 0,
  errors: [],
};

async function refresh() {
  const { refreshOrganization } = await import("@/lib/hockey/refresh");
  return refreshOrganization(deps, ORG, { fullSyncWindowMs: WINDOW_MS });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mockClaimSyncSlot.mockResolvedValue(LEASE);
  mockReleaseSyncSlot.mockResolvedValue(undefined);
  mockSyncOrganizationMatches.mockResolvedValue(syncResult);
  mockStateMaybeSingle.mockResolvedValue({
    data: { last_synced_at: new Date(Date.now() - 60 * 60_000).toISOString() },
    error: null,
  });
});

describe("refreshOrganization", () => {
  it("returns busy when another refresh holds the lease", async () => {
    mockClaimSyncSlot.mockResolvedValue(null);

    await expect(refresh()).resolves.toEqual({ status: "busy" });
    expect(mockClaimSyncSlot).toHaveBeenCalledWith(supabase, ORG, 0);
    expect(mockWatchClubFeeds).not.toHaveBeenCalled();
    expect(mockSyncOrganizationMatches).not.toHaveBeenCalled();
    expect(mockReleaseSyncSlot).not.toHaveBeenCalled();
  });

  it("runs the detector, then the full sync outside its window", async () => {
    const order: string[] = [];
    const detector = { feeds: 1, suspects: 2 };
    mockWatchClubFeeds.mockImplementation(async () => {
      order.push("detector");
      return detector;
    });
    mockSyncOrganizationMatches.mockImplementation(async () => {
      order.push("sync");
      return syncResult;
    });

    const result = await refresh();

    expect(order).toEqual(["detector", "sync"]);
    expect(result).toEqual({ status: "refreshed", detector, sync: syncResult });
    expect(mockReleaseSyncSlot).toHaveBeenCalledWith(supabase, ORG, LEASE);
  });

  it("skips the full sync inside its window while the detector still runs", async () => {
    mockStateMaybeSingle.mockResolvedValue({
      data: { last_synced_at: new Date(Date.now() - 60_000).toISOString() },
      error: null,
    });
    const detector = { feeds: 1, suspects: 1 };
    mockWatchClubFeeds.mockResolvedValue(detector);

    const result = await refresh();

    expect(result).toEqual({ status: "refreshed", detector, sync: null });
    expect(mockWatchClubFeeds).toHaveBeenCalledTimes(1);
    expect(mockSyncOrganizationMatches).not.toHaveBeenCalled();
  });

  it("behaves as a plain sync for an org without feeds", async () => {
    mockWatchClubFeeds.mockResolvedValue(null);
    mockStateMaybeSingle.mockResolvedValue({ data: null, error: null });

    const result = await refresh();

    expect(result).toEqual({
      status: "refreshed",
      detector: null,
      sync: syncResult,
    });
  });

  it("still runs the full sync when the detector throws", async () => {
    mockWatchClubFeeds.mockRejectedValue(new Error("feed table missing"));

    const result = await refresh();

    expect(mockSyncOrganizationMatches).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: "refreshed",
      detector: { errors: ["feed table missing"], suspects: 0 },
      sync: syncResult,
    });
  });

  it("releases the lease when the sync throws", async () => {
    mockWatchClubFeeds.mockResolvedValue(null);
    mockSyncOrganizationMatches.mockRejectedValue(new Error("boom"));

    await expect(refresh()).rejects.toThrow("boom");
    expect(mockReleaseSyncSlot).toHaveBeenCalledWith(supabase, ORG, LEASE);
  });
});
