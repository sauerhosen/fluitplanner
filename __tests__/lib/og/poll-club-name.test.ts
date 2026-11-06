import { describe, it, expect, vi, beforeEach } from "vitest";

const { maybeSingle, eq, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { maybeSingle, eq, select, from };
});
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from }),
}));

import { getPollClubName } from "@/lib/og/poll-club-name";

describe("getPollClubName", () => {
  beforeEach(() => vi.clearAllMocks());

  it("looks the poll up by token in one query and returns its club name", async () => {
    maybeSingle.mockResolvedValue({
      data: { organizations: { name: "HIC", is_active: true } },
      error: null,
    });
    await expect(getPollClubName("tok")).resolves.toEqual({
      found: true,
      clubName: "HIC",
    });
    expect(from).toHaveBeenCalledWith("polls");
    expect(eq).toHaveBeenCalledWith("token", "tok");
    expect(from).toHaveBeenCalledTimes(1);
  });

  it("treats an unknown token as a definite miss", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(getPollClubName("nope")).resolves.toEqual({
      found: false,
      clubName: null,
    });
  });

  it("does not name an inactive club", async () => {
    maybeSingle.mockResolvedValue({
      data: { organizations: { name: "Gone", is_active: false } },
      error: null,
    });
    await expect(getPollClubName("tok")).resolves.toEqual({
      found: false,
      clubName: null,
    });
  });

  // A lookup failure must stay distinguishable from "no such poll", so the
  // caller does not cache a fallback image produced by a transient error.
  it("throws on a database error", async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: { message: "timeout" },
    });
    await expect(getPollClubName("tok")).rejects.toThrow("timeout");
  });
});
