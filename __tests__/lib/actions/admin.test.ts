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
const mockUpdateUserById = vi.fn();

const mockServiceSelect = vi.fn();
const mockServiceInsert = vi.fn();
const mockServiceUpdate = vi.fn();
const mockServiceDelete = vi.fn();
const mockServiceEq = vi.fn();
const mockServiceSingle = vi.fn();
const mockServiceOrder = vi.fn();

function serviceChainable() {
  return {
    select: mockServiceSelect,
    insert: mockServiceInsert,
    update: mockServiceUpdate,
    delete: mockServiceDelete,
    eq: mockServiceEq,
    single: mockServiceSingle,
    order: mockServiceOrder,
  };
}

const mockServiceFrom = vi.fn(() => serviceChainable());

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    auth: {
      admin: {
        listUsers: mockListUsers,
        inviteUserByEmail: mockInviteUserByEmail,
        updateUserById: mockUpdateUserById,
      },
    },
    from: mockServiceFrom,
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
    mockUpdateUserById,
    mockServiceFrom,
    mockServiceSelect,
    mockServiceInsert,
    mockServiceUpdate,
    mockServiceDelete,
    mockServiceEq,
    mockServiceSingle,
    mockServiceOrder,
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

  mockServiceFrom.mockReturnValue(serviceChainable());
  mockServiceSelect.mockReturnValue(serviceChainable());
  mockServiceInsert.mockReturnValue(serviceChainable());
  mockServiceUpdate.mockReturnValue(serviceChainable());
  mockServiceDelete.mockReturnValue(serviceChainable());
  mockServiceEq.mockReturnValue(serviceChainable());
  mockServiceOrder.mockReturnValue(serviceChainable());
  mockServiceSingle.mockResolvedValue({ data: null, error: null });
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
    mockServiceOrder.mockResolvedValue({ data: orgs, error: null });

    const { getOrganizations } = await import("@/lib/actions/admin");
    const result = await getOrganizations();

    expect(result).toEqual(orgs);
    expect(mockServiceFrom).toHaveBeenCalledWith("organizations");
    expect(mockServiceSelect).toHaveBeenCalledWith("*");
    expect(mockServiceOrder).toHaveBeenCalledWith("name");
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
    mockServiceSingle.mockResolvedValue({ data: createdOrg, error: null });

    const { createOrganization } = await import("@/lib/actions/admin");
    const result = await createOrganization("New Club", "new-club");

    expect(result).toEqual(createdOrg);
    expect(mockServiceFrom).toHaveBeenCalledWith("organizations");
    expect(mockServiceInsert).toHaveBeenCalledWith({
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
    mockServiceSingle.mockResolvedValue({ data: updatedOrg, error: null });

    const { updateOrganization } = await import("@/lib/actions/admin");
    const result = await updateOrganization("org-1", {
      name: "Updated Club",
      is_active: false,
    });

    expect(result).toEqual(updatedOrg);
    expect(mockServiceFrom).toHaveBeenCalledWith("organizations");
    expect(mockServiceUpdate).toHaveBeenCalledWith({
      name: "Updated Club",
      is_active: false,
    });
    expect(mockServiceEq).toHaveBeenCalledWith("id", "org-1");
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
    mockServiceInsert.mockResolvedValue({ data: null, error: null });

    const { invitePlanner } = await import("@/lib/actions/admin");
    await invitePlanner("org-1", "planner@example.com");

    expect(mockServiceFrom).toHaveBeenCalledWith("organization_members");
    expect(mockServiceInsert).toHaveBeenCalledWith({
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
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: "new-user-id" } },
      error: null,
    });
    mockUpdateUserById.mockResolvedValue({ data: {}, error: null });

    const { invitePlanner } = await import("@/lib/actions/admin");
    await invitePlanner("org-1", "new@example.com");

    expect(mockInviteUserByEmail).toHaveBeenCalledWith("new@example.com");
    expect(mockUpdateUserById).toHaveBeenCalledWith("new-user-id", {
      app_metadata: { invited_to_org: "org-1" },
    });
  });
});

/* ================================================================== */
/*  getUsers                                                           */
/* ================================================================== */

describe("getUsers", () => {
  it("returns users with their memberships", async () => {
    mockListUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: "user-a",
            email: "a@example.com",
            created_at: "2026-01-01",
            user_metadata: { is_master_admin: true },
          },
          {
            id: "user-b",
            email: "b@example.com",
            created_at: "2026-01-02",
            user_metadata: {},
          },
        ],
      },
      error: null,
    });

    const memberships = [
      {
        user_id: "user-a",
        organization_id: "org-1",
        role: "planner",
        organizations: { name: "Club Alpha", slug: "club-alpha" },
      },
      {
        user_id: "user-b",
        organization_id: "org-1",
        role: "viewer",
        organizations: { name: "Club Alpha", slug: "club-alpha" },
      },
      {
        user_id: "user-b",
        organization_id: "org-2",
        role: "planner",
        organizations: { name: "Club Beta", slug: "club-beta" },
      },
    ];
    mockServiceSelect.mockResolvedValue({ data: memberships, error: null });

    const { getUsers } = await import("@/lib/actions/admin");
    const result = await getUsers();

    expect(result).toHaveLength(2);

    expect(result[0].id).toBe("user-a");
    expect(result[0].email).toBe("a@example.com");
    expect(result[0].is_master_admin).toBe(true);
    expect(result[0].memberships).toHaveLength(1);
    expect(result[0].memberships[0].organization_name).toBe("Club Alpha");
    expect(result[0].memberships[0].role).toBe("planner");

    expect(result[1].id).toBe("user-b");
    expect(result[1].is_master_admin).toBe(false);
    expect(result[1].memberships).toHaveLength(2);
  });

  it("returns empty memberships for users without org membership", async () => {
    mockListUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: "user-lonely",
            email: "lonely@example.com",
            created_at: "2026-01-01",
            user_metadata: {},
          },
        ],
      },
      error: null,
    });

    mockServiceSelect.mockResolvedValue({ data: [], error: null });

    const { getUsers } = await import("@/lib/actions/admin");
    const result = await getUsers();

    expect(result).toHaveLength(1);
    expect(result[0].memberships).toEqual([]);
  });

  it("throws when memberships query fails", async () => {
    mockListUsers.mockResolvedValue({
      data: {
        users: [{ id: "u1", email: "a@b.com", created_at: "2026-01-01" }],
      },
      error: null,
    });
    mockServiceSelect.mockResolvedValue({
      data: null,
      error: { message: "DB error" },
    });

    const { getUsers } = await import("@/lib/actions/admin");
    await expect(getUsers()).rejects.toThrow("DB error");
  });
});

/* ================================================================== */
/*  removeUserFromOrg                                                  */
/* ================================================================== */

describe("removeUserFromOrg", () => {
  it("deletes membership by user and org id", async () => {
    // Chain: from().delete().eq("user_id",...).eq("organization_id",...)
    // The second .eq() is the terminal call, so we resolve it
    mockServiceEq
      .mockReturnValueOnce(serviceChainable()) // first .eq() returns chainable
      .mockResolvedValueOnce({ data: null, error: null }); // second .eq() resolves

    const { removeUserFromOrg } = await import("@/lib/actions/admin");
    await removeUserFromOrg("user-1", "org-1");

    expect(mockServiceFrom).toHaveBeenCalledWith("organization_members");
    expect(mockServiceDelete).toHaveBeenCalled();
    expect(mockServiceEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mockServiceEq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  it("throws when delete fails", async () => {
    mockServiceEq
      .mockReturnValueOnce(serviceChainable())
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Delete failed" },
      });

    const { removeUserFromOrg } = await import("@/lib/actions/admin");
    await expect(removeUserFromOrg("user-1", "org-1")).rejects.toThrow(
      "Delete failed",
    );
  });
});
