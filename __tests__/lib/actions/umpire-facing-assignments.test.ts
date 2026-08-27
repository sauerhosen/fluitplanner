import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Guards the one rule tentative appointments live by: an umpire must never see
 * or feel one. Both umpire-facing reads use the service role, so RLS cannot
 * enforce this — they read the `confirmed_assignments` view instead of the
 * `assignments` table, and these tests fail the moment one reaches for the
 * table again.
 */

/* ------------------------------------------------------------------ */
/*  Service client mock, keyed by relation name                        */
/* ------------------------------------------------------------------ */

type QueryResult = { data: unknown; error: unknown };

const queriedRelations: string[] = [];
let results: Record<string, QueryResult> = {};

function serviceBuilder(relation: string) {
  queriedRelations.push(relation);
  const result: QueryResult = results[relation] ?? { data: null, error: null };

  // Every chained filter returns the builder; awaiting it (or calling
  // single/maybeSingle) yields this relation's canned result.
  const chain = {
    select: () => chain,
    eq: () => chain,
    in: () => chain,
    single: async () => result,
    maybeSingle: async () => result,
    then: (
      onFulfilled: (value: QueryResult) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return chain;
}

const mockServiceFrom = vi.fn((relation: string) => serviceBuilder(relation));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({ from: mockServiceFrom })),
}));

const mockUpsert = vi.fn(async () => ({ error: null }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (relation: string) => {
      if (relation === "availability_responses") {
        return { upsert: mockUpsert };
      }
      return {
        select: () => ({
          eq: () => ({
            single: async () => ({ data: { status: "open" }, error: null }),
          }),
        }),
      };
    },
  })),
}));

/**
 * The table still holds the tentative row; the view — which is what the code
 * under test must read — does not.
 */
const TENTATIVE_ONLY = {
  assignments: { data: [{ match_id: "m1" }], error: null },
  confirmed_assignments: { data: [], error: null },
};

beforeEach(() => {
  queriedRelations.length = 0;
  results = {};
  mockServiceFrom.mockClear();
  mockUpsert.mockClear();
  vi.resetModules();
});

/* ------------------------------------------------------------------ */
/*  Availability lock / assigned-slot badges                           */
/* ------------------------------------------------------------------ */

describe("getPollAssignmentContext", () => {
  it("reads the confirmed-only view, never the assignments table", async () => {
    results = {
      ...TENTATIVE_ONLY,
      polls: { data: { organization_id: "org-1" }, error: null },
      organization_settings: {
        data: { availability_lock_mode: "lock" },
        error: null,
      },
    };

    const { getPollAssignmentContext } =
      await import("@/lib/actions/public-poll-assignments");
    await getPollAssignmentContext("poll-1", "ump-1");

    expect(queriedRelations).toContain("confirmed_assignments");
    expect(queriedRelations).not.toContain("assignments");
  });

  it("leaves a tentatively assigned slot unlocked for the umpire", async () => {
    results = {
      ...TENTATIVE_ONLY,
      polls: { data: { organization_id: "org-1" }, error: null },
      organization_settings: {
        data: { availability_lock_mode: "lock" },
        error: null,
      },
    };

    const { getPollAssignmentContext } =
      await import("@/lib/actions/public-poll-assignments");
    const context = await getPollAssignmentContext("poll-1", "ump-1");

    expect(context.assignedSlots).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  Response submission                                                */
/* ------------------------------------------------------------------ */

describe("submitResponses", () => {
  it("reads the confirmed-only view when checking for conflicts", async () => {
    results = { ...TENTATIVE_ONLY };

    const { submitResponses } = await import("@/lib/actions/public-polls");
    await submitResponses("poll-1", "ump-1", "Jan", [
      { slotId: "slot-1", response: "no" },
    ]);

    expect(queriedRelations).toContain("confirmed_assignments");
    expect(queriedRelations).not.toContain("assignments");
  });

  it("does not warn or block on a slot held only tentatively", async () => {
    results = { ...TENTATIVE_ONLY };

    const { submitResponses } = await import("@/lib/actions/public-polls");
    const result = await submitResponses("poll-1", "ump-1", "Jan", [
      { slotId: "slot-1", response: "no" },
    ]);

    expect(result).toEqual({ status: "saved" });
    expect(mockUpsert).toHaveBeenCalled();
  });
});
