import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockIsPlannerRole = vi.fn();
const mockFetchAllClubs = vi.fn();
const mockFetchClubDetail = vi.fn();

// Chainable table mocks, keyed by table name
const tables: Record<string, ReturnType<typeof vi.fn<() => unknown>>> = {};

function tableMock(name: string) {
  if (!tables[name]) tables[name] = vi.fn<() => unknown>();
  return tables[name];
}

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
  getTenantId: vi.fn(async () => "test-org-id"),
  getTenantSlug: vi.fn(async () => "test"),
  isRootDomain: vi.fn(async () => false),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => tableMock(table)()),
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/actions/organization-settings", () => ({
  isPlannerRole: mockIsPlannerRole,
}));

vi.mock("@/lib/hockey/discovery", () => ({
  fetchAllClubs: mockFetchAllClubs,
  fetchClubDetail: mockFetchClubDetail,
}));

vi.mock("@/lib/hockey/client", () => ({
  createHockeyClient: vi.fn(() => ({ get: vi.fn() })),
}));

vi.mock("@/lib/hockey/credential-store", () => ({
  createDbCredentialStore: vi.fn(() => ({})),
}));

beforeEach(() => {
  vi.resetAllMocks();
  for (const key of Object.keys(tables)) delete tables[key];
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  mockIsPlannerRole.mockResolvedValue(true);
});

describe("searchClubs", () => {
  it("filters clubs case-insensitively on friendly name and city", async () => {
    mockFetchAllClubs.mockResolvedValue([
      {
        federation_reference_id: "A1",
        name: "VVV",
        friendly_name: "VVV",
        city: "Amsterdam",
        type: "regular",
      },
      {
        federation_reference_id: "B2",
        name: "AMVJ",
        friendly_name: "AMVJ",
        city: "Amstelveen",
        type: "regular",
      },
    ]);

    const { searchClubs } = await import("@/lib/actions/hockey-teams");
    const results = await searchClubs("vvv");

    expect(results).toEqual([{ id: "A1", name: "VVV", city: "Amsterdam" }]);
  });

  it("returns empty for queries shorter than 2 characters without hitting the API", async () => {
    const { searchClubs } = await import("@/lib/actions/hockey-teams");
    const results = await searchClubs("v");
    expect(results).toEqual([]);
    expect(mockFetchAllClubs).not.toHaveBeenCalled();
  });

  it("rejects non-planner users", async () => {
    mockIsPlannerRole.mockResolvedValue(false);
    const { searchClubs } = await import("@/lib/actions/hockey-teams");
    await expect(searchClubs("vvv")).rejects.toThrow("NOT_PLANNER");
  });
});

describe("getClubTeams", () => {
  it("returns field-hockey teams and marks tracked ones", async () => {
    mockFetchClubDetail.mockResolvedValue({
      federation_reference_id: "A1",
      teams: [
        { id: 774, name: "VVV D1", hockey_type: "VE", recent_poule_id: 500 },
        { id: 775, name: "VVV H1", hockey_type: "VE", recent_poule_id: 501 },
        {
          id: 900,
          name: "VVV Zaal 1",
          hockey_type: "ZA",
          recent_poule_id: 600,
        },
      ],
    });
    const mockEq = vi.fn().mockResolvedValue({
      data: [{ hockey_team_id: 775 }],
      error: null,
    });
    tableMock("tracked_teams").mockReturnValue({
      select: vi.fn().mockReturnValue({ eq: mockEq }),
    });

    const { getClubTeams } = await import("@/lib/actions/hockey-teams");
    const teams = await getClubTeams("A1");

    expect(teams).toEqual([
      {
        teamId: 774,
        name: "VVV D1",
        hockeyType: "VE",
        recentPouleId: 500,
        tracked: false,
      },
      {
        teamId: 775,
        name: "VVV H1",
        hockeyType: "VE",
        recentPouleId: 501,
        tracked: true,
      },
    ]);
  });
});

describe("trackTeam", () => {
  const input = {
    clubId: "A1",
    clubName: "VVV",
    teamId: 774,
    teamName: "VVV D1",
    hockeyType: "VE",
    recentPouleId: 500,
  };

  function setupManagedTeams(existing: { id: string } | null) {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: existing,
      error: null,
    });
    const managedInsertSingle = vi.fn().mockResolvedValue({
      data: { id: "mt-new" },
      error: null,
    });
    const managedInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: managedInsertSingle }),
    });
    tableMock("managed_teams").mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle }),
        }),
      }),
      insert: managedInsert,
    });
    return { managedInsert };
  }

  function setupTrackedInsert(result: {
    data: unknown;
    error: { code?: string; message: string } | null;
  }) {
    const single = vi.fn().mockResolvedValue(result);
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single }),
    });
    tableMock("tracked_teams").mockReturnValue({ insert });
    return { insert };
  }

  it("creates a managed team when none exists and links it", async () => {
    const { managedInsert } = setupManagedTeams(null);
    const { insert } = setupTrackedInsert({
      data: { id: "tt-1", managed_team_id: "mt-new" },
      error: null,
    });

    const { trackTeam } = await import("@/lib/actions/hockey-teams");
    const result = await trackTeam(input);

    expect(managedInsert).toHaveBeenCalledWith({
      name: "VVV D1",
      required_level: 1,
      created_by: "user-1",
      organization_id: "test-org-id",
    });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_id: "test-org-id",
        club_federation_reference_id: "A1",
        club_name: "VVV",
        hockey_team_id: 774,
        team_name: "VVV D1",
        hockey_type: "VE",
        recent_poule_id: 500,
        managed_team_id: "mt-new",
        created_by: "user-1",
      }),
    );
    expect(result).toEqual({ id: "tt-1", managed_team_id: "mt-new" });
  });

  it("reuses an existing managed team with the same name", async () => {
    const { managedInsert } = setupManagedTeams({ id: "mt-existing" });
    setupTrackedInsert({
      data: { id: "tt-1", managed_team_id: "mt-existing" },
      error: null,
    });

    const { trackTeam } = await import("@/lib/actions/hockey-teams");
    await trackTeam(input);

    expect(managedInsert).not.toHaveBeenCalled();
  });

  it("throws ALREADY_TRACKED on unique violation", async () => {
    setupManagedTeams({ id: "mt-existing" });
    setupTrackedInsert({
      data: null,
      error: { code: "23505", message: "duplicate" },
    });

    const { trackTeam } = await import("@/lib/actions/hockey-teams");
    await expect(trackTeam(input)).rejects.toThrow("ALREADY_TRACKED");
  });

  it("rejects non-planner users", async () => {
    mockIsPlannerRole.mockResolvedValue(false);
    const { trackTeam } = await import("@/lib/actions/hockey-teams");
    await expect(trackTeam(input)).rejects.toThrow("NOT_PLANNER");
  });
});

describe("untrackTeam", () => {
  it("deletes only the tracked_teams row", async () => {
    const mockEqOrg = vi.fn().mockResolvedValue({ error: null });
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqOrg });
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEqId });
    tableMock("tracked_teams").mockReturnValue({ delete: mockDelete });

    const { untrackTeam } = await import("@/lib/actions/hockey-teams");
    await untrackTeam("tt-1");

    expect(mockDelete).toHaveBeenCalled();
    expect(mockEqId).toHaveBeenCalledWith("id", "tt-1");
    expect(mockEqOrg).toHaveBeenCalledWith("organization_id", "test-org-id");
    // managed_teams must not be touched
    expect(tables["managed_teams"]).toBeUndefined();
  });
});
