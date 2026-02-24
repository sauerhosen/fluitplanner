import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Supabase mocks                                                     */
/* ------------------------------------------------------------------ */

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockInsert = vi.fn();
const mockUpsert = vi.fn();
const mockIn = vi.fn();
const mockDelete = vi.fn();

function chainable() {
  return {
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
    order: mockOrder,
    insert: mockInsert,
    upsert: mockUpsert,
    in: mockIn,
    delete: mockDelete,
  };
}

const mockFrom = vi.fn(() => chainable());

const svcSelect = vi.fn();
const svcEq = vi.fn();
const svcMaybeSingle = vi.fn();
const svcIn = vi.fn();
const svcInsert = vi.fn();

function serviceChainable() {
  return {
    select: svcSelect,
    eq: svcEq,
    maybeSingle: svcMaybeSingle,
    in: svcIn,
    insert: svcInsert,
  };
}

const mockServiceFrom = vi.fn(() => serviceChainable());

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
  getTenantId: vi.fn(async () => "test-org-id"),
  getTenantSlug: vi.fn(async () => "test"),
  isRootDomain: vi.fn(async () => false),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
  })),
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    from: mockServiceFrom,
  })),
}));

function resetChain() {
  for (const fn of [
    mockFrom,
    mockSelect,
    mockEq,
    mockSingle,
    mockOrder,
    mockInsert,
    mockUpsert,
    mockIn,
    mockDelete,
    mockServiceFrom,
    svcSelect,
    svcEq,
    svcMaybeSingle,
    svcIn,
    svcInsert,
  ]) {
    fn.mockReset();
  }

  mockFrom.mockReturnValue(chainable());
  mockSelect.mockReturnValue(chainable());
  mockEq.mockReturnValue(chainable());
  mockOrder.mockReturnValue(chainable());
  mockInsert.mockReturnValue(chainable());
  mockUpsert.mockReturnValue(chainable());
  mockIn.mockReturnValue(chainable());
  mockDelete.mockReturnValue(chainable());

  mockServiceFrom.mockReturnValue(serviceChainable());
  svcSelect.mockReturnValue(serviceChainable());
  svcEq.mockReturnValue(serviceChainable());
  svcIn.mockReturnValue(serviceChainable());
  svcInsert.mockReturnValue(serviceChainable());

  mockSingle.mockResolvedValue({ data: null, error: null });
  svcMaybeSingle.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  resetChain();
});

describe("getPollByToken", () => {
  it("returns null for a non-existent token", async () => {
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });

    const { getPollByToken } = await import("@/lib/actions/public-polls");
    const result = await getPollByToken("bad-token");
    expect(result).toBeNull();
  });

  it("returns poll and slots for a valid token", async () => {
    mockSingle.mockResolvedValueOnce({
      data: {
        id: "poll-1",
        title: "Week 10",
        token: "abc123",
        status: "open",
        created_by: "user-1",
        created_at: "2026-02-01T00:00:00Z",
        organization_id: "org-1",
      },
      error: null,
    });

    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: "slot-1",
          poll_id: "poll-1",
          start_time: "2026-02-15T10:00:00Z",
          end_time: "2026-02-15T12:00:00Z",
        },
      ],
      error: null,
    });

    const { getPollByToken } = await import("@/lib/actions/public-polls");
    const result = await getPollByToken("abc123");

    expect(result?.poll.id).toBe("poll-1");
    expect(result?.slots).toHaveLength(1);
  });
});

describe("submitResponses", () => {
  it("returns confirm_required in warn mode before confirmed submit", async () => {
    mockSingle.mockResolvedValueOnce({
      data: { status: "open", organization_id: "org-1" },
      error: null,
    });

    mockIn.mockResolvedValueOnce({
      data: [{ slot_id: "slot-1", response: "yes" }],
      error: null,
    });

    svcMaybeSingle.mockResolvedValueOnce({
      data: { availability_guard_policy: "warn" },
      error: null,
    });

    svcEq.mockReturnValueOnce(serviceChainable());
    svcEq.mockReturnValueOnce(serviceChainable());
    svcEq.mockResolvedValueOnce({
      data: [{ match_id: "m1" }],
      error: null,
    });

    svcIn.mockResolvedValueOnce({
      data: [
        {
          id: "m1",
          date: "2026-02-15",
          start_time: "2026-02-15T10:10:00Z",
          home_team: "A",
          away_team: "B",
          competition: null,
          venue: null,
          field: null,
          required_level: 1,
          created_by: "u1",
          created_at: "2026-01-01T00:00:00Z",
          organization_id: "org-1",
        },
      ],
      error: null,
    });

    svcEq.mockResolvedValueOnce({
      data: [
        {
          id: "slot-1",
          poll_id: "poll-1",
          start_time: "2026-02-15T10:00:00Z",
          end_time: "2026-02-15T12:00:00Z",
        },
      ],
      error: null,
    });

    svcInsert.mockResolvedValueOnce({ error: null });

    const { submitResponses } = await import("@/lib/actions/public-polls");
    const result = await submitResponses("poll-1", "ump-1", "Jan", [
      { slotId: "slot-1", response: "no" },
    ]);

    expect(result).toEqual({
      status: "confirm_required",
      affectedSlots: ["slot-1"],
    });
  });

  it("saves allowed changes and returns partial_saved in block mode", async () => {
    mockSingle.mockResolvedValueOnce({
      data: { status: "open", organization_id: "org-1" },
      error: null,
    });

    mockIn.mockResolvedValueOnce({
      data: [
        { slot_id: "slot-1", response: "yes" },
        { slot_id: "slot-2", response: "if_need_be" },
      ],
      error: null,
    });

    svcMaybeSingle.mockResolvedValueOnce({
      data: { availability_guard_policy: "block" },
      error: null,
    });

    svcEq.mockReturnValueOnce(serviceChainable());
    svcEq.mockReturnValueOnce(serviceChainable());
    svcEq.mockResolvedValueOnce({
      data: [{ match_id: "m1" }],
      error: null,
    });

    svcIn.mockResolvedValueOnce({
      data: [
        {
          id: "m1",
          date: "2026-02-15",
          start_time: "2026-02-15T10:10:00Z",
          home_team: "A",
          away_team: "B",
          competition: null,
          venue: null,
          field: null,
          required_level: 1,
          created_by: "u1",
          created_at: "2026-01-01T00:00:00Z",
          organization_id: "org-1",
        },
      ],
      error: null,
    });

    svcEq.mockResolvedValueOnce({
      data: [
        {
          id: "slot-1",
          poll_id: "poll-1",
          start_time: "2026-02-15T10:00:00Z",
          end_time: "2026-02-15T12:00:00Z",
        },
        {
          id: "slot-2",
          poll_id: "poll-1",
          start_time: "2026-02-15T12:00:00Z",
          end_time: "2026-02-15T14:00:00Z",
        },
      ],
      error: null,
    });

    mockUpsert.mockResolvedValueOnce({ error: null });
    svcInsert.mockResolvedValueOnce({ error: null });

    const { submitResponses } = await import("@/lib/actions/public-polls");
    const result = await submitResponses("poll-1", "ump-1", "Jan", [
      { slotId: "slot-1", response: "no" },
      { slotId: "slot-2", response: "yes" },
    ]);

    expect(result).toEqual({
      status: "partial_saved",
      blockedSlots: ["slot-1"],
    });
    expect(mockUpsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          poll_id: "poll-1",
          slot_id: "slot-2",
          participant_name: "Jan",
          response: "yes",
          umpire_id: "ump-1",
        }),
      ],
      { onConflict: "poll_id,slot_id,umpire_id" },
    );
  });

  it("deletes response when null is submitted", async () => {
    mockSingle.mockResolvedValueOnce({
      data: { status: "open", organization_id: "org-1" },
      error: null,
    });

    mockIn.mockResolvedValueOnce({
      data: [{ slot_id: "slot-1", response: "yes" }],
      error: null,
    });

    svcMaybeSingle.mockResolvedValueOnce({
      data: { availability_guard_policy: "warn" },
      error: null,
    });

    svcEq.mockReturnValueOnce(serviceChainable());
    svcEq.mockReturnValueOnce(serviceChainable());
    svcEq.mockResolvedValueOnce({ data: [], error: null });

    mockDelete.mockReturnValue(chainable());
    mockIn.mockResolvedValueOnce({ error: null });

    const { submitResponses } = await import("@/lib/actions/public-polls");
    const result = await submitResponses("poll-1", "ump-1", "Jan", [
      { slotId: "slot-1", response: null },
    ]);

    expect(result).toEqual({ status: "saved" });
    expect(mockDelete).toHaveBeenCalled();
  });
});
