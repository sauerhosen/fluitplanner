import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockUpsert = vi.fn();
const mockDelete = vi.fn();

function chainable() {
  return {
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
    upsert: mockUpsert,
    delete: mockDelete,
  };
}

const mockFrom = vi.fn(() => chainable());
const mockGetUser = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
  getTenantId: vi.fn(async () => "test-org-id"),
  getTenantSlug: vi.fn(async () => "test"),
  isRootDomain: vi.fn(async () => false),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

function resetChain() {
  for (const fn of [
    mockFrom,
    mockSelect,
    mockEq,
    mockSingle,
    mockUpsert,
    mockDelete,
    mockGetUser,
  ]) {
    fn.mockReset();
  }
  mockFrom.mockReturnValue(chainable());
  mockSelect.mockReturnValue(chainable());
  mockEq.mockReturnValue(chainable());
  mockUpsert.mockReturnValue(chainable());
  mockDelete.mockReturnValue(chainable());
  mockSingle.mockResolvedValue({ data: null, error: null });
}

beforeEach(() => {
  resetChain();
});

import { updatePollResponse } from "@/lib/actions/poll-responses";

describe("updatePollResponse", () => {
  it("throws when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(
      updatePollResponse("poll-1", "slot-1", "umpire-1", "yes"),
    ).rejects.toThrow("Not authenticated");
  });

  it("returns error when poll not found", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: "not found" },
    });
    const result = await updatePollResponse(
      "poll-1",
      "slot-1",
      "umpire-1",
      "yes",
    );
    expect(result).toEqual({ error: "Poll not found" });
  });

  it("returns error when poll does not belong to organization", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });
    const result = await updatePollResponse(
      "poll-1",
      "slot-1",
      "umpire-1",
      "yes",
    );
    expect(result).toEqual({ error: "Poll not found" });
  });

  it("upserts response when value is yes/if_need_be/no", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockSingle
      .mockResolvedValueOnce({
        data: { id: "poll-1", created_by: "user-1" },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "umpire-1", name: "Test Umpire" },
        error: null,
      });
    mockUpsert.mockResolvedValue({ error: null });

    const result = await updatePollResponse(
      "poll-1",
      "slot-1",
      "umpire-1",
      "yes",
    );
    expect(result).toEqual({});
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        poll_id: "poll-1",
        slot_id: "slot-1",
        umpire_id: "umpire-1",
        response: "yes",
        participant_name: "Test Umpire",
      }),
      { onConflict: "poll_id,slot_id,umpire_id" },
    );
  });

  it("deletes response when value is null", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockSingle.mockResolvedValueOnce({
      data: { id: "poll-1", created_by: "user-1" },
      error: null,
    });
    mockDelete.mockReturnValue(chainable());
    mockEq.mockReturnValue(chainable());

    const result = await updatePollResponse(
      "poll-1",
      "slot-1",
      "umpire-1",
      null,
    );
    expect(result).toEqual({});
    expect(mockDelete).toHaveBeenCalled();
  });
});
