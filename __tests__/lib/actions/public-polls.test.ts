import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Supabase mock                                                      */
/* ------------------------------------------------------------------ */

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockInsert = vi.fn();
const mockUpsert = vi.fn();

function chainable() {
  return {
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
    order: mockOrder,
    insert: mockInsert,
    upsert: mockUpsert,
  };
}

const mockFrom = vi.fn(() => chainable());

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
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
    mockInsert,
    mockUpsert,
  ]) {
    fn.mockReset();
  }
  // Default: every chained call returns chainable()
  mockFrom.mockReturnValue(chainable());
  mockSelect.mockReturnValue(chainable());
  mockEq.mockReturnValue(chainable());
  mockOrder.mockReturnValue(chainable());
  mockInsert.mockReturnValue(chainable());
  mockUpsert.mockReturnValue(chainable());
  mockSingle.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  resetChain();
});

/* ================================================================== */
/*  getPollByToken                                                     */
/* ================================================================== */

describe("getPollByToken", () => {
  it("returns null for a non-existent token", async () => {
    // .from("polls").select("*").eq("token", token).single() → error
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });

    const { getPollByToken } = await import("@/lib/actions/public-polls");
    const result = await getPollByToken("bad-token");
    expect(result).toBeNull();
  });

  it("returns poll and slots for a valid token", async () => {
    const poll = {
      id: "poll-1",
      title: "Week 10",
      token: "abc123",
      status: "open",
      created_by: "user-1",
      created_at: "2026-02-01T00:00:00Z",
    };

    const slots = [
      {
        id: "slot-1",
        poll_id: "poll-1",
        start_time: "2026-02-15T10:00:00Z",
        end_time: "2026-02-15T12:00:00Z",
      },
    ];

    // First call: .from("polls")...single() → poll
    mockSingle.mockResolvedValueOnce({ data: poll, error: null });

    // Second call: .from("poll_slots")...order() → slots
    // order returns { data, error } directly for the second query
    mockOrder.mockResolvedValueOnce({ data: slots, error: null });

    const { getPollByToken } = await import("@/lib/actions/public-polls");
    const result = await getPollByToken("abc123");

    expect(result).not.toBeNull();
    expect(result!.poll.id).toBe("poll-1");
    expect(result!.slots).toHaveLength(1);
    expect(result!.slots[0].id).toBe("slot-1");
  });
});

/* ================================================================== */
/*  findOrCreateUmpire                                                 */
/* ================================================================== */

describe("findOrCreateUmpire", () => {
  it("returns existing umpire when email matches", async () => {
    const umpire = {
      id: "ump-1",
      auth_user_id: null,
      name: "Jan",
      email: "jan@example.com",
      level: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    // .from("umpires").select("*").eq("email", ...).single() → umpire
    mockSingle.mockResolvedValueOnce({ data: umpire, error: null });

    const { findOrCreateUmpire } = await import("@/lib/actions/public-polls");
    const result = await findOrCreateUmpire("Jan@Example.com");
    expect(result).toEqual(umpire);
  });

  it("returns null when email not found and no name provided", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "not found", code: "PGRST116" },
    });

    const { findOrCreateUmpire } = await import("@/lib/actions/public-polls");
    const result = await findOrCreateUmpire("unknown@example.com");
    expect(result).toBeNull();
  });

  it("creates new umpire when email not found and name provided", async () => {
    const newUmpire = {
      id: "ump-new",
      auth_user_id: null,
      name: "Piet",
      email: "piet@example.com",
      level: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    // First: lookup fails
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "not found", code: "PGRST116" },
    });
    // Second: insert → select → single → new umpire
    mockSingle.mockResolvedValueOnce({ data: newUmpire, error: null });

    const { findOrCreateUmpire } = await import("@/lib/actions/public-polls");
    const result = await findOrCreateUmpire("Piet@Example.com", "Piet");
    expect(result).toEqual(newUmpire);
  });
});

/* ================================================================== */
/*  findUmpireById                                                     */
/* ================================================================== */

describe("findUmpireById", () => {
  it("returns umpire when found", async () => {
    const umpire = {
      id: "ump-1",
      auth_user_id: null,
      name: "Jan",
      email: "jan@example.com",
      level: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    mockSingle.mockResolvedValueOnce({ data: umpire, error: null });

    const { findUmpireById } = await import("@/lib/actions/public-polls");
    const result = await findUmpireById("ump-1");
    expect(result).toEqual(umpire);
  });

  it("returns null when not found", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });

    const { findUmpireById } = await import("@/lib/actions/public-polls");
    const result = await findUmpireById("bad-id");
    expect(result).toBeNull();
  });
});
