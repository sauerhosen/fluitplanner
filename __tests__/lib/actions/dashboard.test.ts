import { describe, it, expect, vi, beforeEach } from "vitest";
import { format, addDays } from "date-fns";

/* ------------------------------------------------------------------ */
/*  Supabase mock                                                      */
/* ------------------------------------------------------------------ */

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockIn = vi.fn();
const mockGte = vi.fn();
const mockLte = vi.fn();
const mockLt = vi.fn();
const mockNot = vi.fn();
const mockLimit = vi.fn();
const mockGetUser = vi.fn();

function chainable() {
  return {
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
    order: mockOrder,
    in: mockIn,
    gte: mockGte,
    lte: mockLte,
    lt: mockLt,
    not: mockNot,
    limit: mockLimit,
  };
}

const mockFrom = vi.fn(() => chainable());

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
  getTenantId: vi.fn(async () => "test-org-id"),
  getTenantSlug: vi.fn(async () => "test"),
  isRootDomain: vi.fn(async () => false),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  })),
}));

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function resetChain() {
  for (const fn of [
    mockFrom,
    mockSelect,
    mockEq,
    mockSingle,
    mockOrder,
    mockIn,
    mockGte,
    mockLte,
    mockLt,
    mockNot,
    mockLimit,
    mockGetUser,
  ]) {
    fn.mockReset();
  }
  mockFrom.mockReturnValue(chainable());
  mockSelect.mockReturnValue(chainable());
  mockEq.mockReturnValue(chainable());
  mockOrder.mockReturnValue(chainable());
  mockIn.mockReturnValue(chainable());
  mockGte.mockReturnValue(chainable());
  mockLte.mockReturnValue(chainable());
  mockLt.mockReturnValue(chainable());
  mockNot.mockReturnValue(chainable());
  mockLimit.mockReturnValue(chainable());
  mockSingle.mockResolvedValue({ data: null, error: null });
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
}

beforeEach(() => {
  resetChain();
});

const inThreeDays = format(addDays(new Date(), 3), "yyyy-MM-dd");

/* ================================================================== */
/*  getDashboardStats                                                  */
/* ================================================================== */

describe("getDashboardStats", () => {
  it("returns all four stat counts", async () => {
    // Query 1: .from("matches").select().eq("created_by").gte("date").lte("date")
    // eq call #1: eq("created_by", user.id) → chainable
    mockEq.mockReturnValueOnce(chainable());
    // gte/lte use defaults; lte resolves:
    mockLte.mockResolvedValueOnce({
      data: [],
      count: 5,
      error: null,
    });

    // Query 2: .from("polls").select().eq("status","open").eq("created_by",...)
    // eq call #2: eq("status", "open") → chainable
    mockEq.mockReturnValueOnce(chainable());
    // eq call #3: eq("created_by", user.id) → resolves
    mockEq.mockResolvedValueOnce({ data: [], count: 2, error: null });

    // Query 3: .from("poll_matches").select().eq("polls.status","open").eq("polls.organization_id",...)
    // eq call #4: eq("polls.status", "open") → chainable
    mockEq.mockReturnValueOnce(chainable());
    // eq call #5: eq("polls.organization_id", tenantId) → resolves
    mockEq.mockResolvedValueOnce({
      data: [
        { poll_id: "p1", match_id: "m1" },
        { poll_id: "p1", match_id: "m2" },
        { poll_id: "p1", match_id: "m3" },
      ],
      error: null,
    });

    // Query 4: .from("assignments").select("match_id").in("poll_id", [...])
    mockIn.mockResolvedValueOnce({
      data: [
        { match_id: "m1" },
        { match_id: "m1" }, // m1 has 2 assignments (fully assigned)
        { match_id: "m2" }, // m2 has 1 assignment (unassigned)
      ],
      error: null,
    });

    // Query 5: .from("availability_responses").select(...).eq("polls.organization_id",...).not(...)
    // eq call #6: eq("polls.organization_id", tenantId) → chainable
    mockEq.mockReturnValueOnce(chainable());
    mockNot.mockResolvedValueOnce({
      data: [
        { umpire_id: "u1" },
        { umpire_id: "u2" },
        { umpire_id: "u1" }, // duplicate
      ],
      error: null,
    });

    const { getDashboardStats } = await import("@/lib/actions/dashboard");
    const stats = await getDashboardStats();

    expect(stats).toEqual({
      upcomingMatches: 5,
      openPolls: 2,
      unassignedMatches: 2, // m2 (1 assignment) + m3 (0 assignments)
      activeUmpires: 2, // u1 and u2 (deduplicated)
    });
  });

  it("throws when not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: null,
    });

    const { getDashboardStats } = await import("@/lib/actions/dashboard");
    await expect(getDashboardStats()).rejects.toThrow("Not authenticated");
  });
});

/* ================================================================== */
/*  getActionItems                                                     */
/* ================================================================== */

describe("getActionItems", () => {
  it("returns unassigned match items grouped by poll", async () => {
    // mockSelect calls in order:
    // Q1: select("id, title") → chainable (default)
    // Q2: select("poll_id, match_id") → chainable (default)
    // Q3: select("match_id") → chainable (default)
    // Q4: select("poll_id, umpire_id") → chainable (default)
    // Q5: select("id", {count}) → TERMINAL (resolves)
    // Q6: select("id, home_team, ...") → chainable (default)
    // Q7: select("match_id") → TERMINAL (resolves)
    // Queue 4 chainable returns, then resolved, then 1 chainable, then resolved
    mockSelect.mockReturnValueOnce(chainable()); // Q1
    mockSelect.mockReturnValueOnce(chainable()); // Q2
    mockSelect.mockReturnValueOnce(chainable()); // Q3
    mockSelect.mockReturnValueOnce(chainable()); // Q4
    mockSelect.mockReturnValueOnce(chainable()); // Q5 organization_umpires (now chainable for .eq)
    mockSelect.mockReturnValueOnce(chainable()); // Q6
    mockSelect.mockResolvedValueOnce({
      data: [{ match_id: "m1" }, { match_id: "m2" }],
      error: null,
    }); // Q7

    // Q1: .from("polls").select("id, title").eq("status","open").eq("organization_id",...)
    mockEq.mockReturnValueOnce(chainable()); // eq("status")
    mockEq.mockResolvedValueOnce({
      data: [{ id: "p1", title: "Week 10" }],
      error: null,
    }); // eq("organization_id")

    // Q2: .from("poll_matches").select(...).in("poll_id", [...])
    mockIn.mockResolvedValueOnce({
      data: [
        { poll_id: "p1", match_id: "m1" },
        { poll_id: "p1", match_id: "m2" },
      ],
      error: null,
    });

    // Q3: .from("assignments").select("match_id").in("poll_id", [...])
    mockIn.mockResolvedValueOnce({
      data: [{ match_id: "m1" }, { match_id: "m1" }], // m1 fully assigned, m2 not
      error: null,
    });

    // Q4: .from("availability_responses").select("poll_id, umpire_id").in("poll_id", [...])
    mockIn.mockResolvedValueOnce({
      data: [],
      error: null,
    });

    // Q5: .from("organization_umpires").select("id", {count}).eq("organization_id", tenantId)
    mockEq.mockResolvedValueOnce({ data: [], count: 10, error: null });

    // Q6: .from("matches").select(...).eq("organization_id",...).gte().lte()
    mockEq.mockReturnValueOnce(chainable()); // eq("organization_id")
    mockLte.mockResolvedValueOnce({
      data: [
        {
          id: "m-unpolled",
          home_team: "Eagles",
          away_team: "Hawks",
          date: inThreeDays,
        },
      ],
      error: null,
    });

    // Q7: poll_matches handled via mockSelect above

    const { getActionItems } = await import("@/lib/actions/dashboard");
    const items = await getActionItems();

    // Should have: 1 unassigned match item for p1 + 1 low response poll + 1 unpolled match
    const unassignedItems = items.filter((i) => i.type === "unassigned_match");
    expect(unassignedItems.length).toBe(1);
    expect(unassignedItems[0].href).toBe("/protected/polls/p1?tab=assignments");
    expect(unassignedItems[0].label).toContain("1"); // 1 unassigned match
    expect(unassignedItems[0].label).toContain("Week 10");

    const lowResponseItems = items.filter(
      (i) => i.type === "low_response_poll",
    );
    expect(lowResponseItems.length).toBe(1); // 0 responses / 10 umpires < 50%

    const unpolledItems = items.filter((i) => i.type === "unpolled_match");
    expect(unpolledItems.length).toBe(1);
    expect(unpolledItems[0].label).toContain("Eagles");
    expect(unpolledItems[0].href).toBe("/protected/polls/new");
  });

  it("returns empty array when there are no action items", async () => {
    // Q1: .from("polls").select("id, title").eq("status","open").eq("organization_id",...)
    mockEq.mockReturnValueOnce(chainable()); // eq("status")
    mockEq.mockResolvedValueOnce({ data: [], error: null }); // eq("organization_id")

    // pollIds is empty, so skip poll_matches/assignments/responses/umpires

    // Q2: .from("matches").select(...).eq("organization_id",...).gte().lte()
    mockEq.mockReturnValueOnce(chainable()); // eq("organization_id")
    mockLte.mockResolvedValueOnce({ data: [], error: null });

    // No upcoming matches, so skip poll_matches query

    const { getActionItems } = await import("@/lib/actions/dashboard");
    const items = await getActionItems();
    expect(items).toEqual([]);
  });
});

/* ================================================================== */
/*  getRecentActivity                                                  */
/* ================================================================== */

describe("getRecentActivity", () => {
  it("returns merged and sorted activity events", async () => {
    // 1. recent responses
    mockLimit.mockResolvedValueOnce({
      data: [
        {
          participant_name: "Jan",
          poll_id: "poll-1",
          created_at: "2026-02-10T10:00:00Z",
          polls: { title: "Week 10" },
        },
      ],
      error: null,
    });

    // 2. recent assignments
    mockLimit.mockResolvedValueOnce({
      data: [
        {
          created_at: "2026-02-11T09:00:00Z",
          umpires: { name: "Piet" },
          matches: { home_team: "Eagles", away_team: "Hawks" },
        },
      ],
      error: null,
    });

    // 3. recent matches
    mockLimit.mockResolvedValueOnce({
      data: [
        {
          home_team: "Lions",
          away_team: "Tigers",
          created_at: "2026-02-12T08:00:00Z",
        },
      ],
      error: null,
    });

    const { getRecentActivity } = await import("@/lib/actions/dashboard");
    const events = await getRecentActivity();

    expect(events).toHaveLength(3);
    // Should be sorted by timestamp descending
    expect(events[0]).toMatchObject({
      type: "match_added",
      homeTeam: "Lions",
      awayTeam: "Tigers",
      timestamp: "2026-02-12T08:00:00Z",
    });
    expect(events[1]).toMatchObject({
      type: "assignment",
      umpire: "Piet",
      homeTeam: "Eagles",
      awayTeam: "Hawks",
    });
    expect(events[2]).toMatchObject({
      type: "response",
      participant: "Jan",
      pollTitle: "Week 10",
    });
  });

  it("deduplicates responses by participant + poll", async () => {
    // Same umpire responded to 5 slots in the same poll — should collapse to 1 event
    const responses = Array.from({ length: 5 }, (_, i) => ({
      participant_name: "Emiel",
      poll_id: "poll-1",
      created_at: `2026-02-10T10:00:0${i}Z`,
      polls: { title: "Maart 2026" },
    }));
    mockLimit.mockResolvedValueOnce({ data: responses, error: null });
    mockLimit.mockResolvedValueOnce({ data: [], error: null });
    mockLimit.mockResolvedValueOnce({ data: [], error: null });

    const { getRecentActivity } = await import("@/lib/actions/dashboard");
    const events = await getRecentActivity();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "response",
      participant: "Emiel",
      pollTitle: "Maart 2026",
      // Should use the most recent timestamp
      timestamp: "2026-02-10T10:00:04Z",
    });
  });

  it("groups bulk-imported matches into a single event", async () => {
    // 8 matches created within 2 seconds (bulk import)
    const matches = Array.from({ length: 8 }, (_, i) => ({
      home_team: `Team${i}`,
      away_team: `Opp${i}`,
      created_at: `2026-02-12T08:00:0${i}.000Z`,
    }));
    mockLimit.mockResolvedValueOnce({ data: [], error: null });
    mockLimit.mockResolvedValueOnce({ data: [], error: null });
    mockLimit.mockResolvedValueOnce({ data: matches, error: null });

    const { getRecentActivity } = await import("@/lib/actions/dashboard");
    const events = await getRecentActivity();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "matches_batch",
      count: 8,
    });
  });

  it("groups batch assignments into a single event", async () => {
    // 3 assignments created within 2 seconds
    const assignments = Array.from({ length: 3 }, (_, i) => ({
      created_at: `2026-02-11T09:00:0${i}.000Z`,
      umpires: { name: `Umpire${i}` },
      matches: { home_team: "A", away_team: "B" },
    }));
    mockLimit.mockResolvedValueOnce({ data: [], error: null });
    mockLimit.mockResolvedValueOnce({ data: assignments, error: null });
    mockLimit.mockResolvedValueOnce({ data: [], error: null });

    const { getRecentActivity } = await import("@/lib/actions/dashboard");
    const events = await getRecentActivity();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "assignments_batch",
      count: 3,
    });
  });

  it("limits output to 10 events total", async () => {
    // Return 10 unique responses (different umpires), 10 assignments (spread out), 10 matches (spread out)
    const responses = Array.from({ length: 10 }, (_, i) => ({
      participant_name: `Umpire${i}`,
      poll_id: `poll-${i}`,
      created_at: `2026-02-01T${String(i).padStart(2, "0")}:00:00Z`,
      polls: { title: "Week 10" },
    }));
    mockLimit.mockResolvedValueOnce({ data: responses, error: null });

    const assignments = Array.from({ length: 10 }, (_, i) => ({
      created_at: `2026-02-02T${String(i).padStart(2, "0")}:00:00Z`,
      umpires: { name: `Umpire${i}` },
      matches: { home_team: "A", away_team: "B" },
    }));
    mockLimit.mockResolvedValueOnce({ data: assignments, error: null });

    const matches = Array.from({ length: 10 }, (_, i) => ({
      home_team: `Team${i}`,
      away_team: `Opp${i}`,
      created_at: `2026-02-03T${String(i).padStart(2, "0")}:00:00Z`,
    }));
    mockLimit.mockResolvedValueOnce({ data: matches, error: null });

    const { getRecentActivity } = await import("@/lib/actions/dashboard");
    const events = await getRecentActivity();

    expect(events).toHaveLength(10);
    // First event should be the most recent (matches from Feb 3)
    expect(events[0].type).toBe("match_added");
  });
});
