import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HockeyRateLimitError } from "@/lib/hockey/client";
import type { TrackedTeam } from "@/lib/types/domain";

const mockFetchAllFacilities = vi.fn();
const mockFetchAllClubs = vi.fn();
const mockFetchFacilityMatches = vi.fn();

vi.mock("@/lib/hockey/discovery", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/hockey/discovery")>()),
  fetchAllFacilities: mockFetchAllFacilities,
  fetchAllClubs: mockFetchAllClubs,
  fetchFacilityMatches: mockFetchFacilityMatches,
}));

const ORG = "org-1";
const TODAY = "2026-10-24";

const LOOPVELD_VVV = {
  id: 31,
  name: "Sportpark 'Het Loopveld' (VVV)",
  address: { city: "Amstelveen" },
};
const LOOPVELD_AMVJ = {
  id: 73,
  name: "Sportpark 'Het Loopveld' (AMVJ)",
  address: { city: "Amstelveen" },
};
const ELSEWHERE = { id: 5, name: "Sportpark Elders", address: { city: "X" } };

function team(overrides: Partial<TrackedTeam> = {}): TrackedTeam {
  return {
    id: "tt-1",
    organization_id: ORG,
    club_federation_reference_id: "HH11RD6",
    club_name: "VVV HC",
    hockey_team_id: 26042,
    team_name: "VVV HC MO16-2",
    hockey_type: "VE",
    recent_poule_id: 182303,
    managed_team_id: null,
    created_by: "user-1",
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  } as TrackedTeam;
}

/** Fake client answering the learned-venue query with these rows. */
function fakeSupabase(
  rows: Array<{ home_team: string; venue: string | null }>,
  error: { message: string } | null = null,
) {
  const filters: Array<[string, ...unknown[]]> = [];
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => {
      filters.push(["eq", ...args]);
      return query;
    },
    in: (...args: unknown[]) => {
      filters.push(["in", ...args]);
      return query;
    },
    gte: (...args: unknown[]) => {
      filters.push(["gte", ...args]);
      return query;
    },
    limit: async () => ({ data: error ? null : rows, error }),
  };
  return {
    client: { from: () => query } as unknown as SupabaseClient,
    filters,
  };
}

function deps(supabase: SupabaseClient) {
  return { supabase, client: { get: vi.fn() } };
}

beforeEach(() => {
  vi.resetAllMocks();
  mockFetchAllFacilities.mockResolvedValue([
    LOOPVELD_VVV,
    LOOPVELD_AMVJ,
    ELSEWHERE,
  ]);
  mockFetchAllClubs.mockResolvedValue([]);
  mockFetchFacilityMatches.mockResolvedValue([]);
});

describe("resolveHomeFacilities", () => {
  it("learns the venues the club's synced home matches were played at", async () => {
    const { resolveHomeFacilities } = await import("@/lib/hockey/venues");
    const { client, filters } = fakeSupabase([
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_AMVJ.name },
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_AMVJ.name },
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
    ]);

    const { facilities, everyClubCovered } = await resolveHomeFacilities(
      deps(client),
      {
        organizationId: ORG,
        trackedTeams: [team()],
        today: TODAY,
      },
    );

    // most-used first
    expect(facilities.map((f) => f.id)).toEqual([31, 73]);
    expect(everyClubCovered).toBe(true);
    expect(filters).toContainEqual(["eq", "organization_id", ORG]);
    expect(filters).toContainEqual(["eq", "source", "hockey_sync"]);
    expect(mockFetchAllClubs).not.toHaveBeenCalled();
  });

  it("ignores a venue seen only once — a one-off is the poule top-up's job", async () => {
    const { resolveHomeFacilities } = await import("@/lib/hockey/venues");
    const { client } = fakeSupabase([
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
      { home_team: "VVV HC MO16-2", venue: ELSEWHERE.name },
      { home_team: "VVV HC MO16-2", venue: null },
    ]);

    const { facilities, everyClubCovered } = await resolveHomeFacilities(
      deps(client),
      {
        organizationId: ORG,
        trackedTeams: [team()],
        today: TODAY,
      },
    );

    expect(facilities.map((f) => f.id)).toEqual([31]);
    expect(everyClubCovered).toBe(true);
  });

  it("falls back to the club's name and city for a club with nothing synced yet", async () => {
    const { resolveHomeFacilities } = await import("@/lib/hockey/venues");
    mockFetchAllClubs.mockResolvedValue([
      {
        federation_reference_id: "HH11AS0",
        name: "Amsterdamsche Mixed Vereniging J",
        friendly_name: "AMVJ",
        city: "Amstelveen",
        type: "regular",
      },
    ]);
    const { client } = fakeSupabase([
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
    ]);

    const { facilities, everyClubCovered } = await resolveHomeFacilities(
      deps(client),
      {
        organizationId: ORG,
        trackedTeams: [
          team(),
          team({
            id: "tt-2",
            club_federation_reference_id: "HH11AS0",
            club_name: "AMVJ",
            hockey_team_id: 18873,
            team_name: "AMVJ/VVV HC JO12-1",
          }),
        ],
        today: TODAY,
      },
    );

    expect(facilities.map((f) => f.id)).toEqual([31, 73]);
    expect(everyClubCovered).toBe(true);
  });

  it("caps the venues one sync may cost", async () => {
    const { resolveHomeFacilities } = await import("@/lib/hockey/venues");
    const many = Array.from({ length: 8 }, (_, i) => ({
      id: 100 + i,
      name: `Park ${i}`,
      address: { city: "X" },
    }));
    mockFetchAllFacilities.mockResolvedValue(many);
    const { client } = fakeSupabase(
      many.flatMap((f) => [
        { home_team: "VVV HC MO16-2", venue: f.name },
        { home_team: "VVV HC MO16-2", venue: f.name },
      ]),
    );

    const { facilities, everyClubCovered } = await resolveHomeFacilities(
      deps(client),
      {
        organizationId: ORG,
        trackedTeams: [team()],
        today: TODAY,
      },
    );

    expect(facilities.length).toBeLessThanOrEqual(4);
    // a dropped venue may be where some team plays: no claim of coverage
    expect(everyClubCovered).toBe(false);
  });

  it("covers every club only when each resolved a venue", async () => {
    const { resolveHomeFacilities } = await import("@/lib/hockey/venues");
    const { client } = fakeSupabase([
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
    ]);
    const trackedTeams = [
      team(),
      team({
        id: "tt-2",
        club_federation_reference_id: "HH11XX0",
        club_name: "Unknown HC",
        hockey_team_id: 1,
        team_name: "Unknown HC H1",
      }),
    ];

    const one = await resolveHomeFacilities(deps(client), {
      organizationId: ORG,
      trackedTeams: [team()],
      today: TODAY,
    });
    const both = await resolveHomeFacilities(deps(client), {
      organizationId: ORG,
      trackedTeams,
      today: TODAY,
    });

    expect(one.everyClubCovered).toBe(true);
    // the second club is in no club list, so no venue of its is swept
    expect(both.facilities.map((f) => f.id)).toEqual([31]);
    expect(both.everyClubCovered).toBe(false);
  });

  it("keeps the learned venues when the club list is throttled", async () => {
    const { resolveHomeFacilities } = await import("@/lib/hockey/venues");
    mockFetchAllClubs.mockRejectedValue(new HockeyRateLimitError());
    const { client } = fakeSupabase([
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
      { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
    ]);

    const { facilities, everyClubCovered } = await resolveHomeFacilities(
      deps(client),
      {
        organizationId: ORG,
        trackedTeams: [
          team(),
          team({
            id: "tt-2",
            club_federation_reference_id: "HH11AS0",
            hockey_team_id: 18873,
            team_name: "AMVJ/VVV HC JO12-1",
          }),
        ],
        today: TODAY,
      },
    );

    expect(facilities.map((f) => f.id)).toEqual([31]);
    expect(everyClubCovered).toBe(false);
  });
});

describe("sweepHomeVenues", () => {
  const venueRows = [
    { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
    { home_team: "VVV HC MO16-2", venue: LOOPVELD_VVV.name },
  ];

  it("reads each venue four weeks ahead in two 14-day windows", async () => {
    const { sweepHomeVenues } = await import("@/lib/hockey/venues");
    const match = { id: 1, date: "2026-11-14T12:10:00+01:00" };
    mockFetchFacilityMatches
      .mockResolvedValueOnce([match])
      .mockResolvedValueOnce([{ ...match, id: 2 }]);

    const sweep = await sweepHomeVenues(deps(fakeSupabase(venueRows).client), {
      organizationId: ORG,
      trackedTeams: [team()],
      today: TODAY,
      ttlMs: 7_200_000,
    });

    expect(mockFetchFacilityMatches.mock.calls.map((c) => c.slice(1))).toEqual([
      [31, "2026-10-24", { days: 14, ttlMs: 7_200_000 }],
      [31, "2026-11-07", { days: 14, ttlMs: 7_200_000 }],
    ]);
    expect(sweep).toEqual({
      matches: [match, { ...match, id: 2 }],
      complete: true,
      errors: [],
    });
  });

  it("is incomplete without a single known venue", async () => {
    const { sweepHomeVenues } = await import("@/lib/hockey/venues");

    const sweep = await sweepHomeVenues(deps(fakeSupabase([]).client), {
      organizationId: ORG,
      trackedTeams: [team()],
      today: TODAY,
      ttlMs: 1,
    });

    expect(sweep).toEqual({ matches: [], complete: false, errors: [] });
    expect(mockFetchFacilityMatches).not.toHaveBeenCalled();
  });

  it("is incomplete, but reports nothing, when a window is throttled", async () => {
    const { sweepHomeVenues } = await import("@/lib/hockey/venues");
    mockFetchFacilityMatches
      .mockResolvedValueOnce([{ id: 1 }])
      .mockRejectedValueOnce(new HockeyRateLimitError());

    const sweep = await sweepHomeVenues(deps(fakeSupabase(venueRows).client), {
      organizationId: ORG,
      trackedTeams: [team()],
      today: TODAY,
      ttlMs: 1,
    });

    // throttling only matters if it leaves a team without data — the sync
    // decides that once the poule fallback has run
    expect(sweep.complete).toBe(false);
    expect(sweep.errors).toEqual([]);
    expect(sweep.matches).toEqual([{ id: 1 }]);
  });

  it("reports a venue that fails for another reason", async () => {
    const { sweepHomeVenues } = await import("@/lib/hockey/venues");
    mockFetchFacilityMatches.mockRejectedValue(new Error("HTTP 500"));

    const sweep = await sweepHomeVenues(deps(fakeSupabase(venueRows).client), {
      organizationId: ORG,
      trackedTeams: [team()],
      today: TODAY,
      ttlMs: 1,
    });

    expect(sweep.complete).toBe(false);
    expect(sweep.errors).toEqual([
      `Venue ${LOOPVELD_VVV.name}: HTTP 500`,
      `Venue ${LOOPVELD_VVV.name}: HTTP 500`,
    ]);
  });

  it("is incomplete when a tracked club has no venue swept", async () => {
    const { sweepHomeVenues } = await import("@/lib/hockey/venues");
    mockFetchFacilityMatches.mockResolvedValue([{ id: 1 }]);

    const sweep = await sweepHomeVenues(deps(fakeSupabase(venueRows).client), {
      organizationId: ORG,
      trackedTeams: [
        team(),
        team({
          id: "tt-2",
          club_federation_reference_id: "HH11XX0",
          hockey_team_id: 1,
          team_name: "Unknown HC H1",
        }),
      ],
      today: TODAY,
      ttlMs: 1,
    });

    // the swept matches still count; only the claim of coverage goes
    expect(sweep.matches).toEqual([{ id: 1 }, { id: 1 }]);
    expect(sweep.complete).toBe(false);
    expect(sweep.errors).toEqual([]);
  });

  it("is incomplete when the venue list itself cannot be loaded", async () => {
    const { sweepHomeVenues } = await import("@/lib/hockey/venues");
    mockFetchAllFacilities.mockRejectedValue(new HockeyRateLimitError());

    const sweep = await sweepHomeVenues(deps(fakeSupabase(venueRows).client), {
      organizationId: ORG,
      trackedTeams: [team()],
      today: TODAY,
      ttlMs: 1,
    });

    expect(sweep).toEqual({ matches: [], complete: false, errors: [] });
  });
});
