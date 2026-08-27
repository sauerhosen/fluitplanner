import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockRpc = vi.fn();

/** Role the mocked organization_members lookup reports for the caller. */
let callerRole: string | null = "planner";
/** Row counts the mocked `head: true` count queries report, by table. */
let counts: Record<string, number> = {};

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
  getTenantId: vi.fn(async () => "test-org-id"),
  getTenantSlug: vi.fn(async () => "test"),
  isRootDomain: vi.fn(async () => false),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

/**
 * Chainable PostgREST stub: builder methods return the builder, and awaiting it
 * resolves to the row set plus the count the test asked for. Only the two reads
 * the merge path makes are modelled — the membership check and the two count
 * queries — because the merge itself happens inside the database function.
 */
function makeQuery(table: string) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => ({
      data: callerRole === null ? null : { role: callerRole },
      error: null,
    })),
    then: (onFulfilled: (v: unknown) => unknown) =>
      Promise.resolve({
        data: [],
        error: null,
        count: counts[table] ?? 0,
      }).then(onFulfilled),
  };
  return builder;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => makeQuery(table)),
    rpc: mockRpc,
    auth: { getUser: mockGetUser },
  })),
}));

import { mergeUmpires, getUmpireMergePreview } from "@/lib/actions/umpires";

describe("mergeUmpires", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callerRole = "planner";
    counts = {};
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockRpc.mockResolvedValue({
      data: {
        surviving_id: "keep-1",
        disappearing_id: "drop-1",
        responses_moved: 7,
        responses_dropped: 2,
        assignments_moved: 1,
        assignments_dropped: 0,
      },
      error: null,
    });
  });

  it("hands both umpires and the caller's organization to the database function", async () => {
    await mergeUmpires("keep-1", "drop-1");

    expect(mockRpc).toHaveBeenCalledWith("merge_umpires", {
      p_surviving_id: "keep-1",
      p_disappearing_id: "drop-1",
      p_organization_id: "test-org-id",
    });
  });

  it("reports what moved and what was dropped as a conflict", async () => {
    const summary = await mergeUmpires("keep-1", "drop-1");

    expect(summary).toEqual({
      responsesMoved: 7,
      responsesDropped: 2,
      assignmentsMoved: 1,
      assignmentsDropped: 0,
    });
  });

  it("refuses to merge an umpire into themselves without touching the database", async () => {
    await expect(mergeUmpires("keep-1", "keep-1")).rejects.toThrow();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("keeps viewers out of a destructive merge", async () => {
    callerRole = "viewer";

    await expect(mergeUmpires("keep-1", "drop-1")).rejects.toThrow(
      "NOT_PLANNER",
    );
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("surfaces a refusal from the database rather than reporting success", async () => {
    mockRpc.mockResolvedValue({
      data: null,
      error: { message: "Both umpires must be on this organization's roster" },
    });

    await expect(mergeUmpires("keep-1", "drop-1")).rejects.toThrow(/roster/);
  });
});

describe("getUmpireMergePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callerRole = "planner";
    counts = {};
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("counts the availability and appointments the duplicate carries", async () => {
    counts = { availability_responses: 12, assignments: 3 };

    await expect(getUmpireMergePreview("drop-1")).resolves.toEqual({
      responses: 12,
      assignments: 3,
    });
  });

  it("reports zero rather than failing when the duplicate carries nothing", async () => {
    await expect(getUmpireMergePreview("drop-1")).resolves.toEqual({
      responses: 0,
      assignments: 0,
    });
  });
});
