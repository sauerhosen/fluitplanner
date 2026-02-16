import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDelete = vi.fn();
const mockIn = vi.fn();
const mockEq = vi.fn();
const mockGetUser = vi.fn();

function chainable() {
  return {
    delete: mockDelete,
    in: mockIn,
    eq: mockEq,
  };
}

const mockFrom = vi.fn(() => chainable());

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { deleteMatches } from "@/lib/actions/matches";
import { deletePolls } from "@/lib/actions/polls";
import { deleteUmpires } from "@/lib/actions/umpires";
import { revalidatePath } from "next/cache";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
  });
  mockDelete.mockReturnValue(chainable());
  mockIn.mockReturnValue(chainable());
  mockEq.mockReturnValue({ ...chainable(), error: null });
});

describe("deleteMatches", () => {
  it("returns early for empty array", async () => {
    await deleteMatches([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("deletes matches scoped to organization", async () => {
    await deleteMatches(["m1", "m2"]);
    expect(mockFrom).toHaveBeenCalledWith("matches");
    expect(mockDelete).toHaveBeenCalled();
    expect(mockIn).toHaveBeenCalledWith("id", ["m1", "m2"]);
    expect(mockEq).toHaveBeenCalledWith("organization_id", "test-org-id");
  });

  it("calls revalidatePath", async () => {
    await deleteMatches(["m1"]);
    expect(revalidatePath).toHaveBeenCalledWith("/protected/matches");
  });

  it("throws on auth failure", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(deleteMatches(["m1"])).rejects.toThrow("Not authenticated");
  });

  it("throws on database error", async () => {
    mockEq.mockReturnValue({ error: { message: "DB error" } });
    await expect(deleteMatches(["m1"])).rejects.toThrow("DB error");
  });

  it("rejects more than 500 items", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `m${i}`);
    await expect(deleteMatches(ids)).rejects.toThrow(
      "Cannot delete more than 500 items at once",
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe("deletePolls", () => {
  it("returns early for empty array", async () => {
    await deletePolls([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects more than 500 items", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `p${i}`);
    await expect(deletePolls(ids)).rejects.toThrow(
      "Cannot delete more than 500 items at once",
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("deletes polls scoped to organization", async () => {
    await deletePolls(["p1", "p2"]);
    expect(mockFrom).toHaveBeenCalledWith("polls");
    expect(mockDelete).toHaveBeenCalled();
    expect(mockIn).toHaveBeenCalledWith("id", ["p1", "p2"]);
    expect(mockEq).toHaveBeenCalledWith("organization_id", "test-org-id");
  });

  it("calls revalidatePath", async () => {
    await deletePolls(["p1"]);
    expect(revalidatePath).toHaveBeenCalledWith("/protected/polls");
  });
});

describe("deleteUmpires", () => {
  it("returns early for empty array", async () => {
    await deleteUmpires([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("deletes umpire associations scoped to organization", async () => {
    await deleteUmpires(["u1", "u2"]);
    expect(mockFrom).toHaveBeenCalledWith("organization_umpires");
    expect(mockDelete).toHaveBeenCalled();
    expect(mockEq).toHaveBeenCalledWith("organization_id", "test-org-id");
    expect(mockIn).toHaveBeenCalledWith("umpire_id", ["u1", "u2"]);
  });

  it("calls revalidatePath", async () => {
    await deleteUmpires(["u1"]);
    expect(revalidatePath).toHaveBeenCalledWith("/protected/umpires");
  });

  it("rejects more than 500 items", async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `u${i}`);
    await expect(deleteUmpires(ids)).rejects.toThrow(
      "Cannot delete more than 500 items at once",
    );
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
