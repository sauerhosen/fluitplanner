import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ApiMatchSummary } from "@/lib/hockey/types";

const mockFetchClubDetail = vi.fn();
const mockFetchTeamPoule = vi.fn();

vi.mock("@/lib/hockey/discovery", () => ({
  fetchClubDetail: mockFetchClubDetail,
  fetchTeamPoule: mockFetchTeamPoule,
}));

/** Records every query issued against the fake supabase client. */
type RecordedQuery = {
  table: string;
  op: "select" | "update" | "insert" | "upsert" | "delete";
  payload?: unknown;
  filters: Array<[string, ...unknown[]]>;
};

type QueryHandler = (query: RecordedQuery) => {
  data?: unknown;
  error?: { message: string } | null;
};

function makeFakeSupabase(handler: QueryHandler) {
  const queries: RecordedQuery[] = [];

  function chainFor(query: RecordedQuery) {
    const c = {
      eq: (...args: unknown[]) => {
        query.filters.push(["eq", ...args]);
        return c;
      },
      in: (...args: unknown[]) => {
        query.filters.push(["in", ...args]);
        return c;
      },
      is: (...args: unknown[]) => {
        query.filters.push(["is", ...args]);
        return c;
      },
      gte: (...args: unknown[]) => {
        query.filters.push(["gte", ...args]);
        return c;
      },
      lt: (...args: unknown[]) => {
        query.filters.push(["lt", ...args]);
        return c;
      },
      limit: (...args: unknown[]) => {
        query.filters.push(["limit", ...args]);
        return c;
      },
      order: (...args: unknown[]) => {
        query.filters.push(["order", ...args]);
        return c;
      },
      select: (...args: unknown[]) => {
        query.filters.push(["select", ...args]);
        return c;
      },
      maybeSingle: () =>
        Promise.resolve().then(() => ({
          error: null,
          data: null,
          ...handler(query),
        })),
      then: (
        resolve: (value: unknown) => unknown,
        reject?: (reason: unknown) => unknown,
      ) =>
        Promise.resolve()
          .then(() => ({ error: null, data: null, ...handler(query) }))
          .then(resolve, reject),
    };
    return c;
  }

  const client = {
    from: (table: string) => ({
      select: () => {
        const query: RecordedQuery = { table, op: "select", filters: [] };
        queries.push(query);
        return chainFor(query);
      },
      update: (payload: unknown) => {
        const query: RecordedQuery = {
          table,
          op: "update",
          payload,
          filters: [],
        };
        queries.push(query);
        return chainFor(query);
      },
      insert: (payload: unknown) => {
        const query: RecordedQuery = {
          table,
          op: "insert",
          payload,
          filters: [],
        };
        queries.push(query);
        return chainFor(query);
      },
      upsert: (payload: unknown) => {
        const query: RecordedQuery = {
          table,
          op: "upsert",
          payload,
          filters: [],
        };
        queries.push(query);
        return chainFor(query);
      },
      delete: () => {
        const query: RecordedQuery = { table, op: "delete", filters: [] };
        queries.push(query);
        return chainFor(query);
      },
    }),
  };

  return { client, queries };
}

const ORG = "org-1";
const NOW = new Date("2026-08-15T10:00:00+02:00");

const trackedTeam = {
  id: "tt-1",
  organization_id: ORG,
  club_federation_reference_id: "A1",
  club_name: "VVV",
  hockey_team_id: 774,
  team_name: "VVV D1",
  hockey_type: "VE",
  recent_poule_id: 500,
  managed_team_id: "mt-1",
  created_by: "user-1",
  created_at: "2026-08-01T00:00:00Z",
};

function apiMatch(overrides: Partial<ApiMatchSummary> = {}): ApiMatchSummary {
  return {
    id: 9001,
    date: "2026-09-27T12:45:00+02:00",
    status: "scheduled",
    home: { id: 774, name: "VVV D1" },
    away: { id: 812, name: "AMVJ D1" },
    location: { facility: { name: "Sportpark X" }, field: { name: "Veld 2" } },
    poule_id: 500,
    competition_name: "Hoofdklasse",
    ...overrides,
  };
}

function clubDetail(teams: Array<Record<string, unknown>>) {
  return { federation_reference_id: "A1", teams };
}

type TableData = {
  trackedTeams?: unknown[];
  managedTeams?: unknown[];
  matchesByExternal?: unknown[];
  matchesNatural?: unknown[];
};

function defaultHandler(data: TableData): QueryHandler {
  return (query) => {
    if (query.table === "tracked_teams" && query.op === "select") {
      return { data: data.trackedTeams ?? [trackedTeam] };
    }
    if (query.table === "managed_teams" && query.op === "select") {
      return {
        data: data.managedTeams ?? [{ id: "mt-1", required_level: 2 }],
      };
    }
    if (query.table === "matches" && query.op === "select") {
      const isNaturalLookup = query.filters.some(([f]) => f === "is");
      return {
        data: isNaturalLookup
          ? (data.matchesNatural ?? [])
          : (data.matchesByExternal ?? []),
      };
    }
    return {};
  };
}

async function runSync(handler: QueryHandler) {
  const { client, queries } = makeFakeSupabase(handler);
  const { syncOrganizationMatches } = await import("@/lib/hockey/sync");
  const result = await syncOrganizationMatches(
    {
      supabase: client as never,
      client: { get: vi.fn() },
      now: NOW,
    },
    ORG,
  );
  return { result, queries };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockFetchClubDetail.mockResolvedValue(
    clubDetail([
      { id: 774, name: "VVV D1", hockey_type: "VE", recent_poule_id: 500 },
    ]),
  );
});

describe("syncOrganizationMatches", () => {
  it("inserts future home matches with confirmed times", async () => {
    mockFetchTeamPoule.mockResolvedValue({
      poule: {
        id: 500,
        matches: [
          apiMatch(),
          // away match of the tracked team → skipped
          apiMatch({
            id: 9002,
            home: { id: 812, name: "AMVJ D1" },
            away: { id: 774, name: "VVV D1" },
          }),
          // past match → skipped
          apiMatch({ id: 9003, date: "2026-05-01T12:00:00+02:00" }),
          // already played → skipped
          apiMatch({ id: 9004, status: "final" }),
        ],
      },
    });

    const { result, queries } = await runSync(defaultHandler({}));

    const inserts = queries.filter(
      (q) => q.table === "matches" && q.op === "insert",
    );
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toEqual({
      date: "2026-09-27",
      start_time: "2026-09-27T12:45:00+02:00",
      home_team: "VVV D1",
      away_team: "AMVJ D1",
      venue: "Sportpark X",
      field: "Veld 2",
      competition: "Hoofdklasse",
      required_level: 2,
      external_id: 9001,
      source: "hockey_sync",
      created_by: "user-1",
      organization_id: ORG,
      last_synced_at: expect.any(String),
    });
    expect(result.inserted).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("adopts an existing row matching the natural key instead of inserting", async () => {
    mockFetchTeamPoule.mockResolvedValue({
      poule: { id: 500, matches: [apiMatch()] },
    });

    const existing = {
      id: "m-existing",
      date: "2026-09-27",
      start_time: "2026-09-27T10:45:00+00:00", // same instant as +02:00 12:45
      home_team: "VVV D1",
      away_team: "AMVJ D1",
      venue: "Sportpark X",
      field: "Veld 2",
      external_id: null,
      cancelled_upstream: false,
      needs_review: false,
      review_reasons: [],
    };

    const { result, queries } = await runSync(
      defaultHandler({ matchesNatural: [existing] }),
    );

    expect(
      queries.filter((q) => q.table === "matches" && q.op === "insert"),
    ).toHaveLength(0);
    const updates = queries.filter(
      (q) => q.table === "matches" && q.op === "update",
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({
      external_id: 9001,
      source: "hockey_sync",
    });
    // No field actually changed → adopted, not flagged
    expect(updates[0].payload).not.toHaveProperty("needs_review");
    expect(result.inserted).toBe(0);
    expect(result.flagged).toBe(0);
  });

  it("updates and flags a time change without touching required_level", async () => {
    mockFetchTeamPoule.mockResolvedValue({
      poule: {
        id: 500,
        matches: [apiMatch({ date: "2026-09-27T14:00:00+02:00" })],
      },
    });

    const existing = {
      id: "m-1",
      date: "2026-09-27",
      start_time: "2026-09-27T10:45:00+00:00",
      home_team: "VVV D1",
      away_team: "AMVJ D1",
      venue: "Sportpark X",
      field: "Veld 2",
      external_id: 9001,
      cancelled_upstream: false,
      needs_review: false,
      review_reasons: [],
    };

    const { result, queries } = await runSync(
      defaultHandler({ matchesByExternal: [existing] }),
    );

    const updates = queries.filter(
      (q) => q.table === "matches" && q.op === "update",
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({
      start_time: "2026-09-27T14:00:00+02:00",
      needs_review: true,
      review_reasons: ["time_changed"],
    });
    expect(updates[0].payload).not.toHaveProperty("required_level");
    expect(result.updated).toBe(1);
    expect(result.flagged).toBe(1);
  });

  it("flags cancelled matches without deleting and skips unknown cancelled ones", async () => {
    mockFetchTeamPoule.mockResolvedValue({
      poule: {
        id: 500,
        matches: [
          apiMatch({ status: "cancelled" }),
          apiMatch({ id: 9099, status: "cancelled" }), // not in DB → skipped
        ],
      },
    });

    const existing = {
      id: "m-1",
      date: "2026-09-27",
      start_time: "2026-09-27T10:45:00+00:00",
      home_team: "VVV D1",
      away_team: "AMVJ D1",
      venue: "Sportpark X",
      field: "Veld 2",
      external_id: 9001,
      cancelled_upstream: false,
      needs_review: false,
      review_reasons: [],
    };

    const { result, queries } = await runSync(
      defaultHandler({ matchesByExternal: [existing] }),
    );

    expect(queries.filter((q) => q.op === "delete")).toHaveLength(0);
    const updates = queries.filter(
      (q) => q.table === "matches" && q.op === "update",
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toMatchObject({
      cancelled_upstream: true,
      needs_review: true,
      review_reasons: ["cancelled"],
    });
    expect(result.cancelled).toBe(1);
  });

  it("does not re-flag an already cancelled match", async () => {
    mockFetchTeamPoule.mockResolvedValue({
      poule: { id: 500, matches: [apiMatch({ status: "cancelled" })] },
    });

    const existing = {
      id: "m-1",
      date: "2026-09-27",
      start_time: "2026-09-27T10:45:00+00:00",
      home_team: "VVV D1",
      away_team: "AMVJ D1",
      venue: "Sportpark X",
      field: "Veld 2",
      external_id: 9001,
      cancelled_upstream: true,
      needs_review: false, // planner already dismissed the flag
      review_reasons: [],
    };

    const { result, queries } = await runSync(
      defaultHandler({ matchesByExternal: [existing] }),
    );

    expect(
      queries.filter((q) => q.table === "matches" && q.op === "update"),
    ).toHaveLength(0);
    expect(result.cancelled).toBe(0);
  });

  it("counts announced matches without a confirmed time instead of importing them", async () => {
    mockFetchTeamPoule.mockResolvedValue({
      poule: {
        id: 500,
        matches: [
          apiMatch({ status: "announced", date: "2026-09-27T00:00:00+02:00" }),
        ],
      },
    });

    const { result, queries } = await runSync(defaultHandler({}));

    expect(
      queries.filter((q) => q.table === "matches" && q.op === "insert"),
    ).toHaveLength(0);
    expect(result.awaitingTime).toBe(1);
  });

  it("refreshes recent_poule_id when the club detail reports a new poule", async () => {
    mockFetchClubDetail.mockResolvedValue(
      clubDetail([
        { id: 774, name: "VVV D1", hockey_type: "VE", recent_poule_id: 999 },
      ]),
    );
    mockFetchTeamPoule.mockResolvedValue({
      poule: { id: 999, matches: [] },
    });

    const { queries } = await runSync(defaultHandler({}));

    const trackedUpdates = queries.filter(
      (q) => q.table === "tracked_teams" && q.op === "update",
    );
    expect(trackedUpdates).toHaveLength(1);
    expect(trackedUpdates[0].payload).toEqual({ recent_poule_id: 999 });
    expect(mockFetchTeamPoule).toHaveBeenCalledWith(
      expect.anything(),
      999,
      774,
    );
  });

  it("records an error and continues when a tracked team disappears from the club", async () => {
    mockFetchClubDetail.mockResolvedValue(clubDetail([]));

    const { result, queries } = await runSync(defaultHandler({}));

    expect(result.errors).toHaveLength(1);
    expect(mockFetchTeamPoule).not.toHaveBeenCalled();
    // still writes sync state
    const stateUpserts = queries.filter(
      (q) => q.table === "hockey_sync_state" && q.op === "upsert",
    );
    expect(stateUpserts).toHaveLength(1);
    expect(stateUpserts[0].payload).toMatchObject({
      organization_id: ORG,
      last_sync_status: "error",
    });
  });

  it("upserts sync state with counts on success", async () => {
    mockFetchTeamPoule.mockResolvedValue({
      poule: {
        id: 500,
        matches: [
          apiMatch(),
          apiMatch({
            id: 9010,
            status: "announced",
            date: "2026-10-01T00:00:00+02:00",
          }),
        ],
      },
    });

    const { queries } = await runSync(defaultHandler({}));

    const stateUpserts = queries.filter(
      (q) => q.table === "hockey_sync_state" && q.op === "upsert",
    );
    expect(stateUpserts).toHaveLength(1);
    expect(stateUpserts[0].payload).toMatchObject({
      organization_id: ORG,
      last_sync_status: "success",
      last_inserted: 1,
      last_updated: 0,
      last_flagged: 0,
      awaiting_time_count: 1,
      last_sync_error: null,
      last_synced_at: expect.any(String),
    });
  });

  it("returns an empty result without API calls when no teams are tracked", async () => {
    const { result } = await runSync(defaultHandler({ trackedTeams: [] }));
    expect(result).toMatchObject({ inserted: 0, updated: 0, errors: [] });
    expect(mockFetchClubDetail).not.toHaveBeenCalled();
  });
});

describe("claimSyncSlot", () => {
  async function runClaim(opts: {
    lastSyncedAt: string | null;
    leaseRows: unknown[];
  }) {
    const { client, queries } = makeFakeSupabase((query) => {
      if (query.table !== "hockey_sync_state") return {};
      if (query.op === "select") {
        return { data: { last_synced_at: opts.lastSyncedAt } };
      }
      if (query.op === "update") return { data: opts.leaseRows };
      return {};
    });
    const { claimSyncSlot } = await import("@/lib/hockey/sync");
    const claimed = await claimSyncSlot(client as never, ORG, 15 * 60_000);
    return { claimed, queries };
  }

  it("claims the lease when the cooldown has passed", async () => {
    const { claimed, queries } = await runClaim({
      lastSyncedAt: new Date(Date.now() - 16 * 60_000).toISOString(),
      leaseRows: [{ organization_id: ORG }],
    });
    expect(claimed).toBe(true);
    // ensure row → advisory cooldown read → single conditional lease update
    expect(queries.map((q) => `${q.table}:${q.op}`)).toEqual([
      "hockey_sync_state:upsert",
      "hockey_sync_state:select",
      "hockey_sync_state:update",
    ]);
    const lease = queries[2];
    expect(lease.filters).toContainEqual(["eq", "organization_id", ORG]);
    expect(
      lease.filters.some(
        ([op, col]) => op === "lt" && col === "sync_claimed_until",
      ),
    ).toBe(true);
    expect(lease.payload).toHaveProperty("sync_claimed_until");
    expect(lease.payload).not.toHaveProperty("last_synced_at");
  });

  it("claims when the org has never synced", async () => {
    const { claimed } = await runClaim({
      lastSyncedAt: null,
      leaseRows: [{ organization_id: ORG }],
    });
    expect(claimed).toBe(true);
  });

  it("does not claim within the cooldown window and skips the lease update", async () => {
    const { claimed, queries } = await runClaim({
      lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      leaseRows: [{ organization_id: ORG }],
    });
    expect(claimed).toBe(false);
    expect(queries.filter((q) => q.op === "update")).toHaveLength(0);
  });

  it("does not claim while another run holds the lease", async () => {
    const { claimed } = await runClaim({ lastSyncedAt: null, leaseRows: [] });
    expect(claimed).toBe(false);
  });

  it("fails closed when the lease update errors", async () => {
    const { client } = makeFakeSupabase((query) => {
      if (query.op === "update") return { error: { message: "db down" } };
      if (query.op === "select") return { data: { last_synced_at: null } };
      return {};
    });
    const { claimSyncSlot } = await import("@/lib/hockey/sync");
    await expect(
      claimSyncSlot(client as never, ORG, 15 * 60_000),
    ).rejects.toThrow("db down");
  });
});

describe("releaseSyncSlot", () => {
  it("resets the lease for the org", async () => {
    const { client, queries } = makeFakeSupabase(() => ({ data: [] }));
    const { releaseSyncSlot } = await import("@/lib/hockey/sync");
    await releaseSyncSlot(client as never, ORG);

    const update = queries.find((q) => q.op === "update");
    expect(update?.payload).toEqual({
      sync_claimed_until: new Date(0).toISOString(),
    });
    expect(update?.filters).toContainEqual(["eq", "organization_id", ORG]);
  });
});
