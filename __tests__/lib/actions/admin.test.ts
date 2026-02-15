import { describe, it, expect, vi, beforeEach } from "vitest";

/* ------------------------------------------------------------------ */
/*  Supabase mock                                                      */
/* ------------------------------------------------------------------ */

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockOrder = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockGetUser = vi.fn();

function chainable() {
  return {
    select: mockSelect,
    eq: mockEq,
    single: mockSingle,
    order: mockOrder,
    insert: mockInsert,
    update: mockUpdate,
  };
}

const mockFrom = vi.fn(() => chainable());

const mockIsRootDomain = vi.fn(async () => true);

vi.mock("@/lib/tenant", () => ({
  requireTenantId: vi.fn(async () => "test-org-id"),
  getTenantId: vi.fn(async () => "test-org-id"),
  getTenantSlug: vi.fn(async () => "test"),
  isRootDomain: () => mockIsRootDomain(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
  })),
}));

const mockListUsers = vi.fn();
const mockInviteUserByEmail = vi.fn();
const mockServiceInsert = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    auth: {
      admin: {
        listUsers: mockListUsers,
        inviteUserByEmail: mockInviteUserByEmail,
      },
    },
    from: vi.fn(() => ({
      insert: mockServiceInsert,
    })),
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
    mockUpdate,
    mockGetUser,
    mockListUsers,
    mockInviteUserByEmail,
    mockServiceInsert,
    mockIsRootDomain,
  ]) {
    fn.mockReset();
  }
  mockFrom.mockReturnValue(chainable());
  mockSelect.mockReturnValue(chainable());
  mockEq.mockReturnValue(chainable());
  mockOrder.mockReturnValue(chainable());
  mockInsert.mockReturnValue(chainable());
  mockUpdate.mockReturnValue(chainable());
  mockSingle.mockResolvedValue({ data: null, error: null });
  mockIsRootDomain.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({
    data: {
      user: { id: "user-1", user_metadata: { is_master_admin: true } },
    },
    error: null,
  });
}

beforeEach(() => {
  resetChain();
});

/* ================================================================== */
/*  requireMasterAdmin (tested indirectly via exported actions)        */
/* ================================================================== */

describe("requireMasterAdmin", () => {
  it("throws when not on root domain", async () => {
    mockIsRootDomain.mockResolvedValue(false);
    const { getOrganizations } = await import("@/lib/actions/admin");
    await expect(getOrganizations()).rejects.toThrow("Not on root domain");
  });

  it("throws when user is not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { getOrganizations } = await import("@/lib/actions/admin");
    await expect(getOrganizations()).rejects.toThrow("Not authenticated");
  });

  it("throws when user doesn't have is_master_admin metadata", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "user-1", user_metadata: {} } },
      error: null,
    });
    const { getOrganizations } = await import("@/lib/actions/admin");
    await expect(getOrganizations()).rejects.toThrow("Not a master admin");
  });
});

/* ================================================================== */
/*  getOrganizations                                                   */
/* ================================================================== */

describe("getOrganizations", () => {
  it("returns list of organizations", async () => {
    const orgs = [
      {
        id: "org-1",
        name: "Club Alpha",
        slug: "club-alpha",
        is_active: true,
        created_at: "2026-01-01",
        created_by: "user-1",
      },
      {
        id: "org-2",
        name: "Club Beta",
        slug: "club-beta",
        is_active: true,
        created_at: "2026-01-02",
        created_by: "user-1",
      },
    ];
    mockOrder.mockResolvedValue({ data: orgs, error: null });

    const { getOrganizations } = await import("@/lib/actions/admin");
    const result = await getOrganizations();

    expect(result).toEqual(orgs);
    expect(mockFrom).toHaveBeenCalledWith("organizations");
    expect(mockSelect).toHaveBeenCalledWith("*");
    expect(mockOrder).toHaveBeenCalledWith("name");
  });
});

/* ================================================================== */
/*  createOrganization                                                 */
/* ================================================================== */

describe("createOrganization", () => {
  it("rejects invalid slugs", async () => {
    const { createOrganization } = await import("@/lib/actions/admin");

    // Uppercase
    await expect(createOrganization("Test", "INVALID")).rejects.toThrow(
      "Invalid slug",
    );

    // Spaces
    await expect(createOrganization("Test", "has space")).rejects.toThrow(
      "Invalid slug",
    );

    // Too short (single char)
    await expect(createOrganization("Test", "a")).rejects.toThrow(
      "Invalid slug",
    );

    // Starts with hyphen
    await expect(createOrganization("Test", "-abc")).rejects.toThrow(
      "Invalid slug",
    );

    // Ends with hyphen
    await expect(createOrganization("Test", "abc-")).rejects.toThrow(
      "Invalid slug",
    );
  });

  it("creates org with valid slug", async () => {
    const createdOrg = {
      id: "org-new",
      name: "New Club",
      slug: "new-club",
      is_active: true,
      created_at: "2026-02-15",
      created_by: "user-1",
    };
    mockSingle.mockResolvedValue({ data: createdOrg, error: null });

    const { createOrganization } = await import("@/lib/actions/admin");
    const result = await createOrganization("New Club", "new-club");

    expect(result).toEqual(createdOrg);
    expect(mockFrom).toHaveBeenCalledWith("organizations");
    expect(mockInsert).toHaveBeenCalledWith({
      name: "New Club",
      slug: "new-club",
      created_by: "user-1",
    });
  });
});

/* ================================================================== */
/*  updateOrganization                                                 */
/* ================================================================== */

describe("updateOrganization", () => {
  it("updates org fields", async () => {
    const updatedOrg = {
      id: "org-1",
      name: "Updated Club",
      slug: "club-alpha",
      is_active: false,
      created_at: "2026-01-01",
      created_by: "user-1",
    };
    mockSingle.mockResolvedValue({ data: updatedOrg, error: null });

    const { updateOrganization } = await import("@/lib/actions/admin");
    const result = await updateOrganization("org-1", {
      name: "Updated Club",
      is_active: false,
    });

    expect(result).toEqual(updatedOrg);
    expect(mockFrom).toHaveBeenCalledWith("organizations");
    expect(mockUpdate).toHaveBeenCalledWith({
      name: "Updated Club",
      is_active: false,
    });
    expect(mockEq).toHaveBeenCalledWith("id", "org-1");
  });
});

/* ================================================================== */
/*  invitePlanner                                                      */
/* ================================================================== */

describe("invitePlanner", () => {
  it("adds existing user to org directly", async () => {
    mockListUsers.mockResolvedValue({
      data: {
        users: [{ id: "existing-user", email: "planner@example.com" }],
      },
      error: null,
    });
    mockInsert.mockResolvedValue({ data: null, error: null });

    const { invitePlanner } = await import("@/lib/actions/admin");
    await invitePlanner("org-1", "planner@example.com");

    expect(mockFrom).toHaveBeenCalledWith("organization_members");
    expect(mockInsert).toHaveBeenCalledWith({
      organization_id: "org-1",
      user_id: "existing-user",
      role: "planner",
    });
  });

  it("invites new user via email when not found", async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [] },
      error: null,
    });
    mockInviteUserByEmail.mockResolvedValue({ data: {}, error: null });

    const { invitePlanner } = await import("@/lib/actions/admin");
    await invitePlanner("org-1", "new@example.com");

    expect(mockInviteUserByEmail).toHaveBeenCalledWith("new@example.com", {
      data: { invited_to_org: "org-1" },
    });
  });
});
