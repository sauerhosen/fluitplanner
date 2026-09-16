import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ApiMatchSummary } from "@/lib/hockey/types";

const mockRequirePlanner = vi.fn();
const mockFetchClubDetail = vi.fn();
const mockFetchTeamPoule = vi.fn();

type Call = { fn: string; args: unknown[] };
type Query = { table: string; calls: Call[] };

/** Result a canned handler returns for one query, or nothing to fall through. */
type QueryResult = { data?: unknown; error?: { message: string } } | undefined;

let handler: (query: Query) => QueryResult = () => undefined;
let queries: Query[] = [];

/**
 * Chainable PostgREST stand-in: every builder method records itself and
 * returns the builder, and awaiting it (or .single()/.maybeSingle()) hands
 * the recorded chain to the test's handler.
 */
const supabaseMock = {
  from(table: string) {
    const query: Query = { table, calls: [] };
    queries.push(query);
    const settle = () =>
      Promise.resolve(handler(query) ?? { data: null, error: null });
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (...args: unknown[]) =>
              (settle() as Promise<unknown>).then(...(args as [never, never]));
          }
          return (...args: unknown[]) => {
            query.calls.push({ fn: prop, args });
            return prop === "single" || prop === "maybeSingle"
              ? settle()
              : builder;
          };
        },
      },
    );
    return builder;
  },
};

function argsOf(query: Query, fn: string): unknown[][] {
  return query.calls.filter((call) => call.fn === fn).map((call) => call.args);
}

/** Every row handed to matches.insert(), across all queries. */
function insertedRows(): Array<Record<string, unknown>> {
  return queries
    .filter((query) => query.table === "matches")
    .flatMap((query) => argsOf(query, "insert"))
    .flat() as Array<Record<string, unknown>>;
}

vi.mock("@/lib/auth", () => ({ requirePlanner: mockRequirePlanner }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/hockey/deps", () => ({
  createHockeyDeps: vi.fn(() => ({
    supabase: { service: true },
    client: { get: vi.fn() },
  })),
}));

vi.mock("@/lib/hockey/discovery", () => ({
  fetchClubDetail: mockFetchClubDetail,
  fetchTeamPoule: mockFetchTeamPoule,
}));

const TEAM_ID = 774;
const INPUT = { clubId: "VVV", teamId: TEAM_ID };

function makeMatch(overrides: Partial<ApiMatchSummary> = {}): ApiMatchSummary {
  return {
    id: 2079156,
    date: "2099-09-27T12:45:00+02:00",
    status: "scheduled",
    home: { id: TEAM_ID, name: "VVV D3" },
    away: { id: 812, name: "AMVJ D3" },
    location: {
      facility: { name: "Sportpark Kees Boekelaan" },
      field: { name: "Veld 2" },
    },
    competition_name: "3e klasse D",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  queries = [];
  handler = () => undefined;
  mockRequirePlanner.mockResolvedValue({
    supabase: supabaseMock,
    user: { id: "user-1" },
    tenantId: "test-org-id",
  });
  mockFetchClubDetail.mockResolvedValue({
    federation_reference_id: "VVV",
    name: "VVV",
    friendly_name: "VVV",
    city: "Amstelveen",
    type: "regular",
    teams: [{ id: TEAM_ID, name: "VVV D3", recent_poule_id: 180863 }],
  });
  mockFetchTeamPoule.mockResolvedValue({
    team: { id: TEAM_ID, name: "VVV D3", poules: [] },
    poule: { id: 180863, name: "Poule A", matches: [makeMatch()] },
  });
});

describe("getTeamFixtures", () => {
  it("is planner-gated", async () => {
    mockRequirePlanner.mockRejectedValue(new Error("NOT_PLANNER"));
    const { getTeamFixtures } = await import("@/lib/actions/hockey-import");

    await expect(getTeamFixtures(INPUT)).rejects.toThrow("NOT_PLANNER");
    expect(mockFetchClubDetail).not.toHaveBeenCalled();
  });

  it("reads the team's current poule from the club detail", async () => {
    const { getTeamFixtures } = await import("@/lib/actions/hockey-import");
    const fixtures = await getTeamFixtures(INPUT);

    expect(mockFetchTeamPoule).toHaveBeenCalledWith(
      expect.anything(),
      180863,
      TEAM_ID,
    );
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]).toMatchObject({
      matchId: 2079156,
      homeTeam: "VVV D3",
      awayTeam: "AMVJ D3",
      alreadyImported: false,
    });
  });

  it("marks fixtures this club already has, scoped to the club's own org", async () => {
    handler = (query) =>
      query.table === "matches"
        ? { data: [{ external_id: 2079156 }] }
        : undefined;

    const { getTeamFixtures } = await import("@/lib/actions/hockey-import");
    const fixtures = await getTeamFixtures(INPUT);

    expect(fixtures[0].alreadyImported).toBe(true);
    const lookup = queries.find((query) => query.table === "matches");
    expect(argsOf(lookup!, "eq")).toContainEqual([
      "organization_id",
      "test-org-id",
    ]);
  });

  it("reports a team the club no longer lists", async () => {
    mockFetchClubDetail.mockResolvedValue({ teams: [] });
    const { getTeamFixtures } = await import("@/lib/actions/hockey-import");

    await expect(getTeamFixtures(INPUT)).rejects.toThrow("TEAM_NOT_FOUND");
  });

  it("reports a team with no current poule", async () => {
    mockFetchClubDetail.mockResolvedValue({
      teams: [{ id: TEAM_ID, name: "VVV D3", recent_poule_id: null }],
    });
    const { getTeamFixtures } = await import("@/lib/actions/hockey-import");

    await expect(getTeamFixtures(INPUT)).rejects.toThrow("NO_POULE");
  });
});

describe("importTeamFixtures", () => {
  it("inserts the selected fixture at the managed team's required level", async () => {
    handler = (query) => {
      if (query.table === "managed_teams") {
        return { data: [{ name: "VVV D3", required_level: 2 }] };
      }
      return undefined;
    };

    const { importTeamFixtures } = await import("@/lib/actions/hockey-import");
    const result = await importTeamFixtures({ ...INPUT, matchIds: [2079156] });

    expect(result).toMatchObject({ imported: 1, updated: 0, skipped: 0 });
    expect(insertedRows()[0]).toMatchObject({
      date: "2099-09-27",
      start_time: "2099-09-27T12:45:00+02:00",
      home_team: "VVV D3",
      away_team: "AMVJ D3",
      venue: "Sportpark Kees Boekelaan",
      field: "Veld 2",
      competition: "3e klasse D",
      required_level: 2,
      external_id: 2079156,
      source: "hockey_sync",
      organization_id: "test-org-id",
      created_by: "user-1",
    });
  });

  it("defaults to level 1 when no managed team matches the home team", async () => {
    const { importTeamFixtures } = await import("@/lib/actions/hockey-import");
    await importTeamFixtures({ ...INPUT, matchIds: [2079156] });

    expect(insertedRows()[0].required_level).toBe(1);
  });

  it("imports a fixture still awaiting its kick-off time without a time", async () => {
    mockFetchTeamPoule.mockResolvedValue({
      poule: {
        matches: [
          makeMatch({ status: "announced", date: "2099-09-27T00:00:00+02:00" }),
        ],
      },
    });

    const { importTeamFixtures } = await import("@/lib/actions/hockey-import");
    const result = await importTeamFixtures({ ...INPUT, matchIds: [2079156] });

    expect(result.imported).toBe(1);
    expect(insertedRows()[0].start_time).toBeNull();
    expect(insertedRows()[0].date).toBe("2099-09-27");
  });

  it("ignores ids that are not fixtures of this team", async () => {
    const { importTeamFixtures } = await import("@/lib/actions/hockey-import");
    const result = await importTeamFixtures({ ...INPUT, matchIds: [999999] });

    expect(result).toMatchObject({ imported: 0, updated: 0, skipped: 0 });
    const inserts = queries.flatMap((query) => argsOf(query, "insert"));
    expect(inserts).toEqual([]);
  });

  it("adopts a match the planner already added by hand", async () => {
    handler = (query) => {
      if (query.table !== "matches") return undefined;
      const isLookup = query.calls.some((call) => call.fn === "select");
      if (!isLookup) return undefined;
      return {
        data: [
          {
            id: "match-1",
            date: "2099-09-27",
            start_time: null,
            venue: null,
            field: null,
            competition: null,
            external_id: null,
            home_team: "VVV D3",
            away_team: "AMVJ D3",
          },
        ],
      };
    };

    const { importTeamFixtures } = await import("@/lib/actions/hockey-import");
    const result = await importTeamFixtures({ ...INPUT, matchIds: [2079156] });

    expect(result).toMatchObject({ imported: 0, updated: 1, skipped: 0 });
    const update = queries.find((query) =>
      query.calls.some((call) => call.fn === "update"),
    );
    const payload = argsOf(update!, "update")[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      start_time: "2099-09-27T12:45:00+02:00",
      external_id: 2079156,
      source: "hockey_sync",
    });
    // A deliberate import is not a change the planner needs to review.
    expect(payload).not.toHaveProperty("needs_review");
    // The planner's own level choice survives the import.
    expect(payload).not.toHaveProperty("required_level");
    expect(argsOf(update!, "eq")).toContainEqual(["id", "match-1"]);
  });

  it("skips a fixture already imported unchanged", async () => {
    handler = (query) => {
      if (query.table !== "matches") return undefined;
      if (!query.calls.some((call) => call.fn === "select")) return undefined;
      return {
        data: [
          {
            id: "match-1",
            date: "2099-09-27",
            start_time: "2099-09-27T12:45:00+02:00",
            venue: "Sportpark Kees Boekelaan",
            field: "Veld 2",
            competition: "3e klasse D",
            external_id: 2079156,
            home_team: "VVV D3",
            away_team: "AMVJ D3",
          },
        ],
      };
    };

    const { importTeamFixtures } = await import("@/lib/actions/hockey-import");
    const result = await importTeamFixtures({ ...INPUT, matchIds: [2079156] });

    expect(result).toMatchObject({ imported: 0, updated: 0, skipped: 1 });
    const writes = queries.flatMap((query) => [
      ...argsOf(query, "insert"),
      ...argsOf(query, "update"),
    ]);
    expect(writes).toEqual([]);
  });

  it("reports a failed insert without losing the other rows' counts", async () => {
    handler = (query) =>
      query.calls.some((call) => call.fn === "insert")
        ? { error: { message: "boom" } }
        : undefined;

    const { importTeamFixtures } = await import("@/lib/actions/hockey-import");
    const result = await importTeamFixtures({ ...INPUT, matchIds: [2079156] });

    expect(result.imported).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it("is planner-gated", async () => {
    mockRequirePlanner.mockRejectedValue(new Error("NOT_PLANNER"));
    const { importTeamFixtures } = await import("@/lib/actions/hockey-import");

    await expect(
      importTeamFixtures({ ...INPUT, matchIds: [2079156] }),
    ).rejects.toThrow("NOT_PLANNER");
  });
});
