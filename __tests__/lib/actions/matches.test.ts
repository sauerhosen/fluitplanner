import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockUpsertLookup = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
  getTenantId: vi.fn(async () => "test-org-id"),
  getTenantSlug: vi.fn(async () => "test"),
  isRootDomain: vi.fn(async () => false),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      insert: mockInsert,
      update: mockUpdate,
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ maybeSingle: mockUpsertLookup }),
            }),
          }),
        }),
      }),
    })),
    auth: { getUser: mockGetUser },
  })),
}));

const validMatch = {
  date: "2026-09-27",
  start_time: "2026-09-27T12:45:00+02:00",
  home_team: "VVV D1",
  away_team: "AMVJ D1",
  competition: null,
  venue: null,
  field: null,
  required_level: 1 as const,
};

// Server actions are network endpoints: a hostile caller can send fields the
// TypeScript signature does not declare.
const hostileExtras = {
  external_id: 999,
  source: "hockey_sync",
  cancelled_upstream: true,
  needs_review: true,
  review_reasons: ["cancelled"],
  last_synced_at: "2026-01-01T00:00:00Z",
  organization_id: "other-org",
  created_by: "attacker",
};

beforeEach(() => {
  vi.resetAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  const single = vi
    .fn()
    .mockResolvedValue({ data: { id: "m-1" }, error: null });
  const select = vi.fn().mockReturnValue({ single });
  mockInsert.mockReturnValue({ select });
  const eqOrg = vi.fn().mockReturnValue({ select });
  const eqId = vi.fn().mockReturnValue({ eq: eqOrg });
  mockUpdate.mockReturnValue({ eq: eqId });
});

describe("createMatch", () => {
  it("strips sync-managed and ownership fields from hostile payloads", async () => {
    const { createMatch } = await import("@/lib/actions/matches");
    await createMatch({ ...validMatch, ...hostileExtras } as never);

    expect(mockInsert).toHaveBeenCalledWith({
      ...validMatch,
      created_by: "user-1",
      organization_id: "test-org-id",
    });
  });
});

describe("updateMatch", () => {
  it("strips sync-managed fields and passes only declared form fields", async () => {
    const { updateMatch } = await import("@/lib/actions/matches");
    await updateMatch("m-1", {
      start_time: "2026-09-27T14:00:00+02:00",
      ...hostileExtras,
    } as never);

    expect(mockUpdate).toHaveBeenCalledWith({
      start_time: "2026-09-27T14:00:00+02:00",
    });
  });
});

describe("upsertMatches", () => {
  const parsed = {
    date: "2026-09-27",
    start_time: "2026-09-27T12:45:00+02:00",
    home_team: "VVV D1",
    away_team: "AMVJ D1",
    venue: "Sportpark X",
    field: "1",
    competition: null,
    required_level: 2 as const,
  };

  it("inserts new rows with source file_import", async () => {
    mockUpsertLookup.mockResolvedValue({ data: null, error: null });
    const { upsertMatches } = await import("@/lib/actions/matches");
    const result = await upsertMatches([parsed]);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        home_team: "VVV D1",
        source: "file_import",
        organization_id: "test-org-id",
      }),
    );
    expect(result).toEqual({ inserted: 1, updated: 0 });
  });

  it("updates schedule fields on rows it owns", async () => {
    mockUpsertLookup.mockResolvedValue({
      data: { id: "m-1", source: "file_import" },
      error: null,
    });
    const eqId = vi.fn().mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: eqId });

    const { upsertMatches } = await import("@/lib/actions/matches");
    const result = await upsertMatches([parsed]);

    expect(mockUpdate).toHaveBeenCalledWith({
      start_time: parsed.start_time,
      venue: parsed.venue,
      field: parsed.field,
      required_level: parsed.required_level,
      competition: parsed.competition,
    });
    expect(result).toEqual({ inserted: 0, updated: 1 });
  });

  it("only updates required_level on sync-owned rows so imports cannot flap with the sync engine", async () => {
    mockUpsertLookup.mockResolvedValue({
      data: { id: "m-1", source: "hockey_sync" },
      error: null,
    });
    const eqId = vi.fn().mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: eqId });

    const { upsertMatches } = await import("@/lib/actions/matches");
    await upsertMatches([parsed]);

    expect(mockUpdate).toHaveBeenCalledWith({ required_level: 2 });
  });
});
