import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HockeyHttpError, HockeyRateLimitError } from "@/lib/hockey/client";
import { fingerprintOf, type FeedFixture } from "@/lib/club-feed/parse";
import type { ApiMatchSummary } from "@/lib/hockey/types";
import type { ClubFeed } from "@/lib/types/domain";
import type { WatchDeps } from "@/lib/club-feed/watch";

const mockFetchMatch = vi.fn();
vi.mock("@/lib/hockey/discovery", () => ({
  fetchMatch: mockFetchMatch,
}));

const mockReconcileFixtures = vi.fn();
const mockLoadRequiredLevels = vi.fn();
vi.mock("@/lib/hockey/sync", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/hockey/sync")>(
      "@/lib/hockey/sync",
    );
  return {
    ...actual,
    reconcileFixtures: mockReconcileFixtures,
    loadRequiredLevels: mockLoadRequiredLevels,
  };
});

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
    const c: Record<string, unknown> = {};
    for (const name of [
      "eq",
      "in",
      "is",
      "gte",
      "lt",
      "limit",
      "order",
      "range",
      "select",
    ]) {
      c[name] = (...args: unknown[]) => {
        query.filters.push([name, ...args]);
        return c;
      };
    }
    c.maybeSingle = () =>
      Promise.resolve().then(() => ({
        error: null,
        data: null,
        ...handler(query),
      }));
    c.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve()
        .then(() => ({ error: null, data: null, ...handler(query) }))
        .then(resolve, reject);
    return c;
  }

  function record(table: string, op: RecordedQuery["op"], payload?: unknown) {
    const query: RecordedQuery = { table, op, payload, filters: [] };
    queries.push(query);
    return chainFor(query);
  }

  const client = {
    from: (table: string) => ({
      select: () => record(table, "select"),
      update: (payload: unknown) => record(table, "update", payload),
      insert: (payload: unknown) => record(table, "insert", payload),
      upsert: (payload: unknown) => record(table, "upsert", payload),
      delete: () => record(table, "delete"),
    }),
  };

  return { client, queries };
}

function filterValue(query: RecordedQuery, column: string): unknown {
  const filter = query.filters.find(
    ([op, col]) => (op === "eq" || op === "in") && col === column,
  );
  return filter?.[2];
}

const ORG = "org-1";
const NOW = new Date("2026-10-25T10:00:00Z");

type SnapshotDbRow = {
  feed_id: string;
  code: number;
  lisa_team_id: string;
  fingerprint: string;
  pending_fingerprint: string | null;
  checked_at: string | null;
};

type State = {
  feeds: ClubFeed[];
  tracked: Array<Record<string, unknown>>;
  matches: Array<Record<string, unknown>>;
  snapshot: SnapshotDbRow[];
  mappings: Array<{
    feed_id: string;
    lisa_team_id: string;
    tracked_team_id: string;
  }>;
};

function makeFeed(id: string, overrides: Partial<ClubFeed> = {}): ClubFeed {
  return {
    id,
    organization_id: ORG,
    host: `${id}.example.nl`,
    site_alias: "abcd1234",
    apply_changes: true,
    created_by: "user-1",
    created_at: "2026-10-01T00:00:00Z",
    last_polled_at: null,
    last_poll_status: null,
    last_poll_error: null,
    last_suspects: 0,
    last_confirmed: 0,
    ...overrides,
  };
}

const trackedTeam = {
  id: "tt-1",
  organization_id: ORG,
  club_federation_reference_id: "CLUB1",
  club_name: "VVV",
  hockey_team_id: 774,
  team_name: "VVV H1",
  hockey_type: "VE",
  recent_poule_id: 1,
  managed_team_id: null,
  created_by: "user-1",
  created_at: "2026-08-01T00:00:00Z",
};

function fixture(overrides: Partial<FeedFixture> = {}): FeedFixture {
  return {
    code: 1001,
    lisaTeamId: "lisa-h1",
    date: "2026-10-31",
    time: "10:30",
    field: "Veld 1",
    cancelled: false,
    isHome: true,
    venue: "Loopveld",
    ...overrides,
  };
}

function storedMatch(code: number, overrides: Record<string, unknown> = {}) {
  return {
    external_id: code,
    date: "2026-10-31",
    start_time: "2026-10-31T10:30:00+01:00",
    field: "Veld 1",
    cancelled_upstream: false,
    home_team: "VVV H1",
    ...overrides,
  };
}

function apiMatch(
  id: number,
  overrides: Partial<ApiMatchSummary> = {},
): ApiMatchSummary {
  return {
    id,
    date: "2026-10-31T11:00:00+01:00",
    status: "scheduled",
    home: { id: 774, name: "VVV H1" },
    away: { id: 900, name: "Other H1" },
    location: {
      facility: { name: "Loopveld" },
      field: { name: "Veld 1" },
    },
    competition_name: "Heren",
    ...overrides,
  };
}

function snapshotRow(
  feedId: string,
  base: FeedFixture,
  overrides: Partial<SnapshotDbRow> = {},
): SnapshotDbRow {
  return {
    feed_id: feedId,
    code: base.code,
    lisa_team_id: base.lisaTeamId,
    fingerprint: fingerprintOf(base),
    pending_fingerprint: null,
    checked_at: null,
    ...overrides,
  };
}

function setup(
  state: Partial<State>,
  feedFixtures: Record<string, FeedFixture[] | Error>,
) {
  const full: State = {
    feeds: [],
    tracked: [trackedTeam],
    matches: [],
    snapshot: [],
    mappings: [],
    ...state,
  };
  const { client, queries } = makeFakeSupabase((query) => {
    if (query.op !== "select") return { data: null };
    switch (query.table) {
      case "club_feeds":
        return { data: full.feeds };
      case "tracked_teams":
        return { data: full.tracked };
      case "matches": {
        const codes = (filterValue(query, "external_id") as number[]) ?? [];
        return {
          data: full.matches.filter((row) =>
            codes.includes(row.external_id as number),
          ),
        };
      }
      case "club_feed_teams": {
        const feedIds = (filterValue(query, "feed_id") as string[]) ?? [];
        return {
          data: full.mappings.filter((row) => feedIds.includes(row.feed_id)),
        };
      }
      case "club_feed_fixtures": {
        const feedId = filterValue(query, "feed_id");
        return {
          data: full.snapshot.filter((row) => row.feed_id === feedId),
        };
      }
      default:
        return { data: [] };
    }
  });
  const fetchFeed = vi.fn<NonNullable<WatchDeps["fetchFeed"]>>(async (feed) => {
    const result = feedFixtures[feed.id];
    if (result instanceof Error) throw result;
    return { fixtures: result ?? [], problems: [] };
  });
  const deps = {
    supabase: client as never,
    client: { get: vi.fn() },
    now: NOW,
    fetchFeed,
  };
  return { deps, queries, fetchFeed };
}

function snapshotWrites(queries: RecordedQuery[], feedId: string) {
  return queries
    .filter((q) => q.table === "club_feed_fixtures" && q.op === "upsert")
    .flatMap((q) => q.payload as Array<Record<string, unknown>>)
    .filter((row) => row.feed_id === feedId);
}

function feedStatus(queries: RecordedQuery[], feedId: string) {
  return queries.find(
    (q) =>
      q.table === "club_feeds" &&
      q.op === "update" &&
      filterValue(q, "id") === feedId,
  )?.payload as Record<string, unknown> | undefined;
}

async function watch(deps: unknown) {
  const { watchClubFeeds } = await import("@/lib/club-feed/watch");
  return watchClubFeeds(deps as never, ORG);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  mockLoadRequiredLevels.mockResolvedValue(new Map());
  mockReconcileFixtures.mockResolvedValue({
    inserted: 0,
    updated: 1,
    flagged: 1,
    cancelled: 0,
    awaitingTime: 0,
    errors: [],
  });
  mockFetchMatch.mockImplementation(async (_deps, id: number) => apiMatch(id));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("watchClubFeeds", () => {
  it("returns null for an org without feeds", async () => {
    const { deps } = setup({ feeds: [] }, {});
    await expect(watch(deps)).resolves.toBeNull();
    expect(mockFetchMatch).not.toHaveBeenCalled();
  });

  it("writes a baseline on the first poll without changed suspects", async () => {
    const rows = [fixture({ code: 1001 }), fixture({ code: 1002 })];
    const { deps, queries } = setup(
      {
        feeds: [makeFeed("f1")],
        matches: [storedMatch(1001), storedMatch(1002)],
      },
      { f1: rows },
    );

    const result = await watch(deps);

    expect(result?.suspects).toBe(0);
    expect(mockFetchMatch).not.toHaveBeenCalled();
    const written = snapshotWrites(queries, "f1");
    expect(written).toHaveLength(2);
    expect(written[0]).toMatchObject({
      organization_id: ORG,
      fingerprint: fingerprintOf(rows[0]),
      pending_fingerprint: null,
      seen_at: NOW.toISOString(),
    });
    expect(feedStatus(queries, "f1")).toMatchObject({
      last_poll_status: "success",
      last_suspects: 0,
      last_confirmed: 0,
    });
  });

  it("confirms and reconciles a changed row on a stored code", async () => {
    const before = fixture();
    const after = fixture({ time: "11:00" });
    const { deps, queries } = setup(
      {
        feeds: [makeFeed("f1")],
        matches: [storedMatch(1001)],
        snapshot: [snapshotRow("f1", before)],
      },
      { f1: [after] },
    );

    const result = await watch(deps);

    expect(mockFetchMatch).toHaveBeenCalledTimes(1);
    expect(mockFetchMatch.mock.calls[0][1]).toBe(1001);
    expect(mockReconcileFixtures).toHaveBeenCalledTimes(1);
    const [, orgId, entries, opts] = mockReconcileFixtures.mock.calls[0];
    expect(orgId).toBe(ORG);
    expect(entries).toHaveLength(1);
    expect(entries[0].fixture.matchId).toBe(1001);
    expect(entries[0].team.id).toBe("tt-1");
    expect(opts.today).toBe("2026-10-25");
    expect(result).toMatchObject({
      suspects: 1,
      confirmed: 1,
      pending: 0,
      shadowed: 0,
      updated: 1,
      flagged: 1,
    });
    expect(snapshotWrites(queries, "f1")[0]).toMatchObject({
      fingerprint: fingerprintOf(after),
      pending_fingerprint: null,
      checked_at: NOW.toISOString(),
    });
    expect(feedStatus(queries, "f1")).toMatchObject({
      last_suspects: 1,
      last_confirmed: 1,
    });
  });

  it("confirms but does not apply in shadow mode", async () => {
    const before = fixture();
    const { deps, queries } = setup(
      {
        feeds: [makeFeed("f1", { apply_changes: false })],
        matches: [storedMatch(1001)],
        snapshot: [snapshotRow("f1", before)],
      },
      { f1: [fixture({ time: "11:00" })] },
    );

    const result = await watch(deps);

    expect(mockFetchMatch).toHaveBeenCalledTimes(1);
    expect(mockReconcileFixtures).not.toHaveBeenCalled();
    expect(result).toMatchObject({ confirmed: 1, shadowed: 1, updated: 0 });
    expect(console.info).toHaveBeenCalledWith(
      "[club-feed] shadow",
      expect.stringContaining('"code":1001'),
    );
    // The snapshot still advances: the Match Center was asked.
    expect(snapshotWrites(queries, "f1")[0].pending_fingerprint).toBeNull();
  });

  it("confirms at most MAX_CONFIRMATIONS_PER_RUN, cancellations then soonest first", async () => {
    const { MAX_CONFIRMATIONS_PER_RUN } = await import("@/lib/club-feed/watch");
    const dates = [
      "2026-11-20",
      "2026-11-05",
      "2026-11-12",
      "2026-10-28",
      "2026-11-01",
      "2026-11-30",
    ];
    const before = dates.map((date, i) => fixture({ code: 2000 + i, date }));
    const after = before.map((row) => ({ ...row, time: "12:00" }));
    // The latest match is cancelled: it must still go first.
    after[5] = { ...after[5], cancelled: true };
    const { deps, queries } = setup(
      {
        feeds: [makeFeed("f1")],
        matches: before.map((row) =>
          storedMatch(row.code, {
            date: row.date,
            start_time: `${row.date}T10:30:00+01:00`,
          }),
        ),
        snapshot: before.map((row) => snapshotRow("f1", row)),
      },
      { f1: after },
    );

    const result = await watch(deps);

    expect(MAX_CONFIRMATIONS_PER_RUN).toBe(4);
    expect(mockFetchMatch.mock.calls.map((call) => call[1])).toEqual([
      2005, 2003, 2004, 2001,
    ]);
    expect(result).toMatchObject({ suspects: 6, confirmed: 4, pending: 2 });
    const written = snapshotWrites(queries, "f1");
    const unconfirmed = written.find((row) => row.code === 2000);
    expect(unconfirmed?.pending_fingerprint).toBe(fingerprintOf(after[0]));
    expect(unconfirmed?.fingerprint).toBe(fingerprintOf(before[0]));
  });

  it("stops on a rate limit and leaves the suspect pending", async () => {
    const before = fixture();
    const after = fixture({ field: "Veld 2" });
    mockFetchMatch.mockRejectedValue(new HockeyRateLimitError());
    const { deps, queries } = setup(
      {
        feeds: [makeFeed("f1")],
        matches: [storedMatch(1001)],
        snapshot: [snapshotRow("f1", before)],
      },
      { f1: [after] },
    );

    const result = await watch(deps);

    expect(result).toMatchObject({ suspects: 1, confirmed: 0, pending: 1 });
    expect(result?.errors).toEqual([]);
    expect(mockReconcileFixtures).not.toHaveBeenCalled();
    expect(snapshotWrites(queries, "f1")[0]).toMatchObject({
      fingerprint: fingerprintOf(before),
      pending_fingerprint: fingerprintOf(after),
      checked_at: null,
    });
  });

  it.each([
    ["a timeout", new DOMException("The operation timed out.", "TimeoutError")],
    ["a network failure", new TypeError("fetch failed")],
    ["an upstream error", new HockeyHttpError(502)],
  ])("leaves the suspect and the rest pending after %s", async (_, failure) => {
    const rows = [fixture({ code: 1001 }), fixture({ code: 1002 })];
    const changed = rows.map((row) => ({ ...row, time: "11:00" }));
    mockFetchMatch.mockRejectedValue(failure);
    const { deps, queries } = setup(
      {
        feeds: [makeFeed("f1")],
        matches: [storedMatch(1001), storedMatch(1002)],
        snapshot: rows.map((row) => snapshotRow("f1", row)),
      },
      { f1: changed },
    );

    const result = await watch(deps);

    expect(mockFetchMatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ suspects: 2, confirmed: 0, pending: 2 });
    expect(result?.errors).toEqual([expect.stringMatching(/^Match 1001: .*/)]);
    expect(result?.errors[0]).toContain((failure as Error).message);
    for (const row of snapshotWrites(queries, "f1")) {
      expect(row).toMatchObject({ checked_at: null });
      expect(row.pending_fingerprint).not.toBeNull();
    }
  });

  it("records a withdrawn match id (404) as checked", async () => {
    const before = fixture();
    const after = fixture({ time: "11:00" });
    mockFetchMatch.mockRejectedValue(new HockeyHttpError(404, "Not found"));
    const { deps, queries } = setup(
      {
        feeds: [makeFeed("f1")],
        matches: [storedMatch(1001)],
        snapshot: [snapshotRow("f1", before)],
      },
      { f1: [after] },
    );

    const result = await watch(deps);

    expect(result).toMatchObject({ suspects: 1, confirmed: 0, pending: 0 });
    expect(result?.errors).toEqual(["Match 1001: Not found"]);
    expect(mockReconcileFixtures).not.toHaveBeenCalled();
    expect(snapshotWrites(queries, "f1")[0]).toMatchObject({
      fingerprint: fingerprintOf(after),
      pending_fingerprint: null,
      checked_at: NOW.toISOString(),
    });
  });

  it("asks fresh for a changed row, and accepts a cached answer otherwise", async () => {
    const unchanged = fixture({ code: 1001 });
    const before = fixture({ code: 1002 });
    const { deps } = setup(
      {
        feeds: [makeFeed("f1")],
        // 1001 drifts: the feed agrees with its snapshot, not with us.
        matches: [
          storedMatch(1001, { start_time: "2026-10-31T12:00:00+01:00" }),
          storedMatch(1002),
        ],
        snapshot: [snapshotRow("f1", unchanged), snapshotRow("f1", before)],
      },
      { f1: [unchanged, { ...before, time: "11:00" }] },
    );

    await watch(deps);

    const ttlByCode = new Map(
      mockFetchMatch.mock.calls.map((call) => [call[1], call[2]]),
    );
    expect(ttlByCode.get(1002)).toBe(0);
    expect(ttlByCode.get(1001)).toBeGreaterThan(0);
  });

  it("drops a code that is another team's home match and corrects the mapping", async () => {
    const before = fixture({ code: 3001, lisaTeamId: "lisa-x" });
    const after = { ...before, time: "12:00" };
    mockFetchMatch.mockResolvedValue(
      apiMatch(3001, { home: { id: 999, name: "Untracked H5" } }),
    );
    const { deps, queries } = setup(
      {
        feeds: [makeFeed("f1")],
        mappings: [
          { feed_id: "f1", lisa_team_id: "lisa-x", tracked_team_id: "tt-1" },
        ],
        snapshot: [snapshotRow("f1", before)],
      },
      { f1: [after] },
    );

    const result = await watch(deps);

    expect(result).toMatchObject({ suspects: 1, confirmed: 1 });
    expect(mockReconcileFixtures).not.toHaveBeenCalled();
    expect(snapshotWrites(queries, "f1")[0]).toMatchObject({
      fingerprint: fingerprintOf(after),
      pending_fingerprint: null,
      checked_at: NOW.toISOString(),
    });
    const deleted = queries.find(
      (q) => q.table === "club_feed_teams" && q.op === "delete",
    );
    expect(deleted).toBeDefined();
    expect(filterValue(deleted!, "lisa_team_id")).toBe("lisa-x");
    expect(filterValue(deleted!, "feed_id")).toBe("f1");
  });

  it("skips a feed polled less than two minutes ago", async () => {
    const { deps, fetchFeed, queries } = setup(
      {
        feeds: [
          makeFeed("f1", {
            last_polled_at: new Date(NOW.getTime() - 60_000).toISOString(),
          }),
        ],
      },
      { f1: [fixture()] },
    );

    const result = await watch(deps);

    expect(fetchFeed).not.toHaveBeenCalled();
    expect(result).toMatchObject({ feeds: 1, polled: 0, suspects: 0 });
    expect(feedStatus(queries, "f1")).toBeUndefined();
  });

  it("records a failing feed as an error and carries on with the others", async () => {
    const before = fixture();
    const { deps, queries } = setup(
      {
        feeds: [makeFeed("f1"), makeFeed("f2")],
        matches: [storedMatch(1001)],
        snapshot: [snapshotRow("f2", before)],
      },
      { f1: new Error("HTTP 500"), f2: [fixture({ time: "11:00" })] },
    );

    const result = await watch(deps);

    expect(result?.polled).toBe(1);
    expect(result?.errors).toContain("f1.example.nl: HTTP 500");
    expect(feedStatus(queries, "f1")).toMatchObject({
      last_poll_status: "error",
      last_poll_error: "HTTP 500",
    });
    expect(feedStatus(queries, "f2")).toMatchObject({
      last_poll_status: "success",
      last_confirmed: 1,
    });
    expect(mockReconcileFixtures).toHaveBeenCalledTimes(1);
  });

  it("stops polling at the budget and leaves the rest for the next run", async () => {
    const { POLL_BUDGET_MS } = await import("@/lib/club-feed/watch");
    let clock = NOW.getTime();
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    const { deps, fetchFeed, queries } = setup(
      { feeds: [makeFeed("f1"), makeFeed("f2")] },
      { f1: [fixture()], f2: [fixture()] },
    );
    fetchFeed.mockImplementationOnce(async () => {
      clock += POLL_BUDGET_MS;
      return { fixtures: [], problems: [] };
    });

    const result = await watch(deps);

    expect(fetchFeed).toHaveBeenCalledTimes(1);
    expect(fetchFeed.mock.calls[0][1]).toEqual({
      deadline: NOW.getTime() + POLL_BUDGET_MS,
    });
    expect(result).toMatchObject({ feeds: 2, polled: 1 });
    expect(result?.errors).toEqual(["f2.example.nl: not polled, out of time"]);
    expect(feedStatus(queries, "f1")).toBeDefined();
    expect(feedStatus(queries, "f2")).toBeUndefined();
    const feedQuery = queries.find(
      (q) => q.table === "club_feeds" && q.op === "select",
    );
    expect(feedQuery?.filters).toContainEqual([
      "order",
      "last_polled_at",
      { ascending: true, nullsFirst: true },
    ]);
  });

  it("learns a mapping from a stored match of a tracked team", async () => {
    const { deps, queries } = setup(
      {
        feeds: [makeFeed("f1")],
        matches: [storedMatch(1001)],
      },
      { f1: [fixture({ lisaTeamId: "lisa-h1" })] },
    );

    await watch(deps);

    const upsert = queries.find(
      (q) => q.table === "club_feed_teams" && q.op === "upsert",
    );
    expect(upsert?.payload).toEqual({
      feed_id: "f1",
      organization_id: ORG,
      lisa_team_id: "lisa-h1",
      tracked_team_id: "tt-1",
    });
  });

  it("confirms a combined team's match once for two feeds and advances both", async () => {
    const inF1 = fixture({ lisaTeamId: "lisa-a", field: "Water 1" });
    const inF2 = fixture({ lisaTeamId: "lisa-b", field: "Veld 1" });
    const changedF1 = { ...inF1, time: "11:00" };
    const changedF2 = { ...inF2, time: "11:00" };
    const { deps, queries } = setup(
      {
        feeds: [makeFeed("f1"), makeFeed("f2")],
        matches: [storedMatch(1001)],
        snapshot: [snapshotRow("f1", inF1), snapshotRow("f2", inF2)],
      },
      { f1: [changedF1], f2: [changedF2] },
    );

    const result = await watch(deps);

    expect(mockFetchMatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ suspects: 1, confirmed: 1 });
    expect(snapshotWrites(queries, "f1")[0]).toMatchObject({
      fingerprint: fingerprintOf(changedF1),
      pending_fingerprint: null,
    });
    expect(snapshotWrites(queries, "f2")[0]).toMatchObject({
      fingerprint: fingerprintOf(changedF2),
      pending_fingerprint: null,
    });
    expect(feedStatus(queries, "f1")?.last_confirmed).toBe(1);
    expect(feedStatus(queries, "f2")?.last_confirmed).toBe(1);
  });

  it("scopes every club-feed and matches query to the organization", async () => {
    const before = fixture();
    const { deps, queries } = setup(
      {
        feeds: [makeFeed("f1")],
        matches: [storedMatch(1001)],
        snapshot: [snapshotRow("f1", before)],
        mappings: [
          { feed_id: "f1", lisa_team_id: "lisa-h1", tracked_team_id: "tt-1" },
        ],
      },
      { f1: [fixture({ time: "11:00" })] },
    );

    await watch(deps);

    const scoped = [
      "club_feeds",
      "club_feed_fixtures",
      "club_feed_teams",
      "matches",
      "tracked_teams",
    ];
    const relevant = queries.filter(
      (q) => scoped.includes(q.table) && q.op !== "upsert",
    );
    expect(relevant.length).toBeGreaterThan(0);
    for (const query of relevant) {
      expect(filterValue(query, "organization_id")).toBe(ORG);
    }
    // Upserts carry the org in each row instead.
    for (const query of queries.filter((q) => q.op === "upsert")) {
      const rows = [query.payload].flat() as Array<Record<string, unknown>>;
      for (const row of rows) expect(row.organization_id).toBe(ORG);
    }
  });
});
