import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { gate } from "@/__tests__/helpers/auth-gate";
import { MAX_NOTE_LENGTH } from "@/lib/domain/notes";

const mockGetUser = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockUpsertLookup = vi.fn();

// The write actions gate through requirePlanner(); flip `gate.role` to
// "viewer" to make the caller read-only for one test.
vi.mock("@/lib/auth", async () =>
  (await import("@/__tests__/helpers/auth-gate")).authGateMock(),
);

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
  notes: null,
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

  it("accepts notes as an editable form field", async () => {
    const { updateMatch } = await import("@/lib/actions/matches");
    await updateMatch("m-1", { notes: "Umpire X would like to be assigned" });

    expect(mockUpdate).toHaveBeenCalledWith({
      notes: "Umpire X would like to be assigned",
    });
  });
});

describe("note validation", () => {
  it("rejects an over-long note on createMatch, not just the note editor", async () => {
    const { createMatch } = await import("@/lib/actions/matches");

    await expect(
      createMatch({ ...validMatch, notes: "x".repeat(MAX_NOTE_LENGTH + 1) }),
    ).rejects.toThrow(/2000 characters/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects an over-long note on updateMatch", async () => {
    const { updateMatch } = await import("@/lib/actions/matches");

    await expect(
      updateMatch("m-1", { notes: "x".repeat(MAX_NOTE_LENGTH + 1) }),
    ).rejects.toThrow(/2000 characters/);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("trims and NULLs a blank note written through the match form", async () => {
    const { createMatch } = await import("@/lib/actions/matches");
    await createMatch({ ...validMatch, notes: "   " });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ notes: null }),
    );
  });
});

describe("updateMatchNotes", () => {
  it("writes the trimmed note", async () => {
    const { updateMatchNotes } = await import("@/lib/actions/matches");
    await updateMatchNotes("m-1", "  Don't assign Y  ");

    expect(mockUpdate).toHaveBeenCalledWith({ notes: "Don't assign Y" });
  });

  it("clears the note when the body is blank", async () => {
    const { updateMatchNotes } = await import("@/lib/actions/matches");
    await updateMatchNotes("m-1", "   ");

    expect(mockUpdate).toHaveBeenCalledWith({ notes: null });
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

describe("viewer role", () => {
  afterEach(() => {
    gate.role = "planner";
  });

  it("refuses every match write with NOT_PLANNER", async () => {
    gate.role = "viewer";
    const { createMatch, updateMatch, deleteMatch, upsertMatches } =
      await import("@/lib/actions/matches");
    await expect(
      createMatch({
        date: "2026-03-01",
        home_team: "A",
        away_team: "B",
      } as never),
    ).rejects.toThrow("NOT_PLANNER");
    await expect(updateMatch("m1", { notes: "x" })).rejects.toThrow(
      "NOT_PLANNER",
    );
    await expect(deleteMatch("m1")).rejects.toThrow("NOT_PLANNER");
    await expect(upsertMatches([{} as never])).rejects.toThrow("NOT_PLANNER");
  });
});
