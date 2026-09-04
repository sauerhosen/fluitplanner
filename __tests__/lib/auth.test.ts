import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetUser = vi.fn();
const mockMembershipMaybeSingle = vi.fn();

const mockGetTenantId = vi.fn(
  async (): Promise<string | null> => "test-org-id",
);

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
  getTenantId: mockGetTenantId,
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
  mockGetTenantId.mockResolvedValue("test-org-id");
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

  it("throws the query error when the membership lookup fails", async () => {
    mockMembershipMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: "db down" },
    });
    const { requirePlanner } = await import("@/lib/auth");
    await expect(requirePlanner()).rejects.toThrow("db down");
  });
});

describe("requireMember", () => {
  it("returns the role for planners", async () => {
    mockMembershipMaybeSingle.mockResolvedValue({
      data: { role: "planner" },
      error: null,
    });
    const { requireMember } = await import("@/lib/auth");
    const context = await requireMember();
    expect(context.role).toBe("planner");
    expect(context.tenantId).toBe("test-org-id");
  });

  it("lets viewers through with their role", async () => {
    mockMembershipMaybeSingle.mockResolvedValue({
      data: { role: "viewer" },
      error: null,
    });
    const { requireMember } = await import("@/lib/auth");
    const context = await requireMember();
    expect(context.role).toBe("viewer");
  });

  it("throws NOT_MEMBER when no membership exists", async () => {
    mockMembershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { requireMember } = await import("@/lib/auth");
    await expect(requireMember()).rejects.toThrow("NOT_MEMBER");
  });

  it("throws when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { requireMember } = await import("@/lib/auth");
    await expect(requireMember()).rejects.toThrow("Not authenticated");
  });
});

describe("getMembershipRole", () => {
  it("returns the membership role", async () => {
    mockMembershipMaybeSingle.mockResolvedValue({
      data: { role: "viewer" },
      error: null,
    });
    const { getMembershipRole } = await import("@/lib/auth");
    expect(await getMembershipRole()).toBe("viewer");
  });

  it("returns null when signed out", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { getMembershipRole } = await import("@/lib/auth");
    expect(await getMembershipRole()).toBeNull();
    expect(mockMembershipMaybeSingle).not.toHaveBeenCalled();
  });

  it("returns null outside a tenant context", async () => {
    mockGetTenantId.mockResolvedValue(null);
    const { getMembershipRole } = await import("@/lib/auth");
    expect(await getMembershipRole()).toBeNull();
    expect(mockMembershipMaybeSingle).not.toHaveBeenCalled();
  });

  it("returns null for non-members", async () => {
    mockMembershipMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { getMembershipRole } = await import("@/lib/auth");
    expect(await getMembershipRole()).toBeNull();
  });
});
