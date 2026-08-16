import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockMembershipMaybeSingle = vi.fn();

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: mockMembershipMaybeSingle,
          }),
        }),
      }),
    })),
    auth: { getUser: mockGetUser },
  })),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
});

describe("requireAuthContext", () => {
  it("returns the client and user when authenticated", async () => {
    const { requireAuthContext } = await import("@/lib/auth");
    const context = await requireAuthContext();
    expect(context.user.id).toBe("user-1");
  });

  it("throws when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { requireAuthContext } = await import("@/lib/auth");
    await expect(requireAuthContext()).rejects.toThrow("Not authenticated");
  });
});

describe("requirePlanner", () => {
  it("returns context including the tenant for planner members", async () => {
    mockMembershipMaybeSingle.mockResolvedValue({
      data: { role: "planner" },
      error: null,
    });
    const { requirePlanner } = await import("@/lib/auth");
    const context = await requirePlanner();
    expect(context.tenantId).toBe("test-org-id");
  });

  it("throws NOT_PLANNER for viewer members", async () => {
    mockMembershipMaybeSingle.mockResolvedValue({
      data: { role: "viewer" },
      error: null,
    });
    const { requirePlanner } = await import("@/lib/auth");
    await expect(requirePlanner()).rejects.toThrow("NOT_PLANNER");
  });

  it("throws NOT_PLANNER when no membership exists", async () => {
    mockMembershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { requirePlanner } = await import("@/lib/auth");
    await expect(requirePlanner()).rejects.toThrow("NOT_PLANNER");
  });
});
