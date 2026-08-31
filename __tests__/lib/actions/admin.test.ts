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
const mockGetUserById = vi.fn();
const mockDeleteUser = vi.fn();

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
const mockServiceRpc = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: vi.fn(() => ({
    auth: {
      admin: {
        listUsers: mockListUsers,
        inviteUserByEmail: mockInviteUserByEmail,
        updateUserById: mockUpdateUserById,
        getUserById: mockGetUserById,
        deleteUser: mockDeleteUser,
      },
    },
    from: mockServiceFrom,
    rpc: mockServiceRpc,
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
    mockGetUserById,
    mockDeleteUser,
    mockServiceFrom,
    mockServiceRpc,
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
  mockServiceRpc.mockResolvedValue({ data: false, error: null });
  mockIsRootDomain.mockResolvedValue(true);
  mockGetUser.mockResolvedValue({
    data: {
      user: { id: "user-1", app_metadata: { is_master_admin: true } },
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
      data: { user: { id: "user-1", app_metadata: {} } },
      error: null,
    });
    const { getOrganizations } = await import("@/lib/actions/admin");
    await expect(getOrganizations()).rejects.toThrow("Not a master admin");
  });

  it("ignores a self-assigned user_metadata flag", async () => {
    // user_metadata is writable by the user itself, so it must never grant access
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          app_metadata: {},
          user_metadata: { is_master_admin: true },
        },
      },
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
            email_confirmed_at: "2026-01-01",
            banned_until: null,
            app_metadata: { is_master_admin: true },
            user_metadata: {},
          },
          {
            id: "user-b",
            email: "b@example.com",
            created_at: "2026-01-02",
            email_confirmed_at: "2026-01-02",
            app_metadata: {},
            user_metadata: { is_master_admin: true },
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
    expect(result[0].is_disabled).toBe(false);
    expect(result[0].memberships).toHaveLength(1);
    expect(result[0].memberships[0].organization_name).toBe("Club Alpha");
    expect(result[0].memberships[0].role).toBe("planner");

    expect(result[1].id).toBe("user-b");
    // user_metadata flag is self-assignable and must not be reported as admin
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
            email_confirmed_at: "2026-01-01",
            app_metadata: {},
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

  it("reports a banned account as disabled", async () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    mockListUsers.mockResolvedValue({
      data: {
        users: [
          {
            id: "banned",
            email: "banned@example.com",
            created_at: "2026-01-01",
            email_confirmed_at: "2026-01-01",
            banned_until: future,
            app_metadata: {},
          },
          {
            id: "expired-ban",
            email: "back@example.com",
            created_at: "2026-01-01",
            email_confirmed_at: "2026-01-01",
            banned_until: past,
            app_metadata: {},
          },
        ],
      },
      error: null,
    });
    mockServiceSelect.mockResolvedValue({ data: [], error: null });

    const { getUsers } = await import("@/lib/actions/admin");
    const result = await getUsers();

    expect(result[0].is_disabled).toBe(true);
    // A ban that has already lapsed is not a disabled account
    expect(result[1].is_disabled).toBe(false);
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

/* ================================================================== */
/*  updateMemberRole                                                   */
/* ================================================================== */

describe("updateMemberRole", () => {
  it("updates the role on the membership row", async () => {
    mockServiceEq
      .mockReturnValueOnce(serviceChainable())
      .mockResolvedValueOnce({ data: null, error: null });

    const { updateMemberRole } = await import("@/lib/actions/admin");
    await updateMemberRole("user-1", "org-1", "viewer");

    expect(mockServiceFrom).toHaveBeenCalledWith("organization_members");
    expect(mockServiceUpdate).toHaveBeenCalledWith({ role: "viewer" });
    expect(mockServiceEq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mockServiceEq).toHaveBeenCalledWith("organization_id", "org-1");
  });

  it("rejects a role outside the schema's allowed values", async () => {
    const { updateMemberRole } = await import("@/lib/actions/admin");
    await expect(
      // @ts-expect-error deliberately passing an invalid role
      updateMemberRole("user-1", "org-1", "owner"),
    ).rejects.toThrow("Invalid role");
    expect(mockServiceUpdate).not.toHaveBeenCalled();
  });

  it("throws when the update fails", async () => {
    mockServiceEq
      .mockReturnValueOnce(serviceChainable())
      .mockResolvedValueOnce({ data: null, error: { message: "nope" } });

    const { updateMemberRole } = await import("@/lib/actions/admin");
    await expect(
      updateMemberRole("user-1", "org-1", "planner"),
    ).rejects.toThrow("nope");
  });
});

/* ================================================================== */
/*  resendInvite                                                       */
/* ================================================================== */

describe("resendInvite", () => {
  it("re-invites a pending user and restores their target org", async () => {
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          id: "user-2",
          email: "pending@example.com",
          email_confirmed_at: null,
          app_metadata: { invited_to_org: "org-9" },
        },
      },
      error: null,
    });
    mockInviteUserByEmail.mockResolvedValue({
      data: { user: { id: "user-2" } },
      error: null,
    });
    mockUpdateUserById.mockResolvedValue({ data: {}, error: null });

    const { resendInvite } = await import("@/lib/actions/admin");
    await resendInvite("user-2");

    expect(mockInviteUserByEmail).toHaveBeenCalledWith("pending@example.com");
    expect(mockUpdateUserById).toHaveBeenCalledWith("user-2", {
      app_metadata: { invited_to_org: "org-9" },
    });
  });

  it("refuses to re-invite a user who already accepted", async () => {
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          id: "user-3",
          email: "active@example.com",
          email_confirmed_at: "2026-03-01",
          app_metadata: {},
        },
      },
      error: null,
    });

    const { resendInvite } = await import("@/lib/actions/admin");
    await expect(resendInvite("user-3")).rejects.toThrow(
      "User has already accepted their invite",
    );
    expect(mockInviteUserByEmail).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  revokePendingInvite                                                */
/* ================================================================== */

describe("revokePendingInvite", () => {
  it("deletes memberships then the pending auth user", async () => {
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          id: "user-2",
          email: "pending@example.com",
          email_confirmed_at: null,
        },
      },
      error: null,
    });
    mockServiceEq.mockResolvedValue({ data: null, error: null });
    mockDeleteUser.mockResolvedValue({ data: null, error: null });

    const { revokePendingInvite } = await import("@/lib/actions/admin");
    await revokePendingInvite("user-2");

    expect(mockServiceFrom).toHaveBeenCalledWith("organization_members");
    expect(mockServiceDelete).toHaveBeenCalled();
    expect(mockServiceEq).toHaveBeenCalledWith("user_id", "user-2");
    expect(mockDeleteUser).toHaveBeenCalledWith("user-2");
  });

  it("refuses to revoke the signed-in master admin's own invite", async () => {
    const { revokePendingInvite } = await import("@/lib/actions/admin");
    await expect(revokePendingInvite("user-1")).rejects.toThrow(
      "You cannot revoke your own invite",
    );
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("refuses to revoke an accepted user", async () => {
    mockGetUserById.mockResolvedValue({
      data: {
        user: {
          id: "user-3",
          email: "active@example.com",
          email_confirmed_at: "2026-03-01",
        },
      },
      error: null,
    });

    const { revokePendingInvite } = await import("@/lib/actions/admin");
    await expect(revokePendingInvite("user-3")).rejects.toThrow(
      "User has already accepted their invite",
    );
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  deleteUser                                                         */
/* ================================================================== */

describe("deleteUser", () => {
  it("deletes memberships then the auth user", async () => {
    mockServiceEq.mockResolvedValue({ data: null, error: null });
    mockDeleteUser.mockResolvedValue({ data: null, error: null });

    const { deleteUser } = await import("@/lib/actions/admin");
    await deleteUser("user-2");

    expect(mockServiceFrom).toHaveBeenCalledWith("organization_members");
    expect(mockServiceDelete).toHaveBeenCalled();
    expect(mockServiceEq).toHaveBeenCalledWith("user_id", "user-2");
    expect(mockDeleteUser).toHaveBeenCalledWith("user-2");
  });

  it("refuses to delete the signed-in master admin", async () => {
    const { deleteUser } = await import("@/lib/actions/admin");
    await expect(deleteUser("user-1")).rejects.toThrow(
      "You cannot delete your own account",
    );
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("reports a plain delete as deleted", async () => {
    mockServiceEq.mockResolvedValue({ data: null, error: null });
    mockDeleteUser.mockResolvedValue({ data: null, error: null });

    const { deleteUser } = await import("@/lib/actions/admin");
    await expect(deleteUser("user-2")).resolves.toEqual({
      outcome: "deleted",
    });
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it("disables the account when records still reference it", async () => {
    mockServiceEq.mockResolvedValue({ data: null, error: null });
    // GoTrue hides the underlying Postgres error behind a generic 500
    mockDeleteUser.mockResolvedValue({
      data: null,
      error: { message: "Database error deleting user", status: 500 },
    });
    mockServiceRpc.mockResolvedValue({ data: true, error: null });
    mockUpdateUserById.mockResolvedValue({ data: {}, error: null });

    const { deleteUser } = await import("@/lib/actions/admin");
    await expect(deleteUser("user-2")).resolves.toEqual({
      outcome: "disabled",
    });

    expect(mockServiceRpc).toHaveBeenCalledWith("auth_user_is_referenced", {
      target_user: "user-2",
    });
    // Banned indefinitely rather than deleted, so the created_by rows survive
    expect(mockUpdateUserById).toHaveBeenCalledWith("user-2", {
      ban_duration: "876000h",
    });
  });

  it("throws when the delete failed but nothing references the account", async () => {
    mockServiceEq.mockResolvedValue({ data: null, error: null });
    mockDeleteUser.mockResolvedValue({
      data: null,
      error: { message: "Database error deleting user", status: 500 },
    });
    mockServiceRpc.mockResolvedValue({ data: false, error: null });

    const { deleteUser } = await import("@/lib/actions/admin");
    await expect(deleteUser("user-2")).rejects.toThrow(
      "Database error deleting user",
    );
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it("puts the memberships back when the account survives a failed delete", async () => {
    // First .eq() is the snapshot read, second is the membership delete.
    mockServiceEq
      .mockResolvedValueOnce({
        data: [{ organization_id: "org-1", role: "planner" }],
        error: null,
      })
      .mockResolvedValue({ data: null, error: null });
    mockDeleteUser.mockResolvedValue({
      data: null,
      error: { message: "Database error deleting user", status: 500 },
    });
    mockServiceRpc.mockResolvedValue({ data: false, error: null });

    const { deleteUser } = await import("@/lib/actions/admin");
    await expect(deleteUser("user-2")).rejects.toThrow(
      "Database error deleting user",
    );
    expect(mockServiceInsert).toHaveBeenCalledWith([
      { organization_id: "org-1", role: "planner", user_id: "user-2" },
    ]);
  });

  it("says so when the memberships could not be put back", async () => {
    mockServiceEq
      .mockResolvedValueOnce({
        data: [{ organization_id: "org-1", role: "planner" }],
        error: null,
      })
      .mockResolvedValue({ data: null, error: null });
    mockServiceInsert.mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });
    mockDeleteUser.mockResolvedValue({
      data: null,
      error: { message: "Database error deleting user", status: 500 },
    });
    mockServiceRpc.mockResolvedValue({ data: false, error: null });

    const { deleteUser } = await import("@/lib/actions/admin");
    await expect(deleteUser("user-2")).rejects.toThrow(
      "club memberships could not be restored",
    );
  });

  it("throws rather than guessing when the reference probe itself fails", async () => {
    mockServiceEq.mockResolvedValue({ data: null, error: null });
    mockDeleteUser.mockResolvedValue({
      data: null,
      error: { message: "Database error deleting user", status: 500 },
    });
    mockServiceRpc.mockResolvedValue({
      data: null,
      error: { message: "rpc unavailable" },
    });

    const { deleteUser } = await import("@/lib/actions/admin");
    await expect(deleteUser("user-2")).rejects.toThrow(
      "Database error deleting user",
    );
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });
});

/* ================================================================== */
/*  disableUser / enableUser                                           */
/* ================================================================== */

describe("disableUser", () => {
  it("strips club memberships before making the ban stick", async () => {
    mockServiceEq.mockResolvedValue({ data: [], error: null });
    mockUpdateUserById.mockResolvedValue({ data: {}, error: null });

    const { disableUser } = await import("@/lib/actions/admin");
    await disableUser("user-2");

    expect(mockUpdateUserById).toHaveBeenCalledWith("user-2", {
      ban_duration: "876000h",
    });
    expect(mockServiceFrom).toHaveBeenCalledWith("organization_members");
    expect(mockServiceDelete).toHaveBeenCalled();
    expect(mockServiceEq).toHaveBeenCalledWith("user_id", "user-2");

    // Order matters: a ban alone does not cut club access for an already
    // issued token — dropping the memberships is what RLS acts on.
    expect(mockServiceDelete.mock.invocationCallOrder[0]).toBeLessThan(
      mockUpdateUserById.mock.invocationCallOrder[0],
    );
  });

  it("puts the memberships back when the ban fails", async () => {
    // First .eq() is the snapshot read, the rest are the delete.
    mockServiceEq
      .mockResolvedValueOnce({
        data: [{ organization_id: "org-1", role: "planner" }],
        error: null,
      })
      .mockResolvedValue({ data: null, error: null });
    mockUpdateUserById.mockResolvedValue({
      data: null,
      error: { message: "ban failed" },
    });

    const { disableUser } = await import("@/lib/actions/admin");
    await expect(disableUser("user-2")).rejects.toThrow("ban failed");

    expect(mockServiceInsert).toHaveBeenCalledWith([
      { organization_id: "org-1", role: "planner", user_id: "user-2" },
    ]);
  });

  it("never bans when the memberships could not be removed", async () => {
    mockServiceEq
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValue({ data: null, error: { message: "delete failed" } });

    const { disableUser } = await import("@/lib/actions/admin");
    await expect(disableUser("user-2")).rejects.toThrow("delete failed");
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it("refuses to disable the signed-in master admin", async () => {
    const { disableUser } = await import("@/lib/actions/admin");
    await expect(disableUser("user-1")).rejects.toThrow(
      "You cannot disable your own account",
    );
    expect(mockUpdateUserById).not.toHaveBeenCalled();
  });

  it("says so when the memberships could not be put back either", async () => {
    mockServiceEq
      .mockResolvedValueOnce({
        data: [{ organization_id: "org-1", role: "planner" }],
        error: null,
      })
      .mockResolvedValue({ data: null, error: null });
    mockServiceInsert.mockResolvedValue({
      data: null,
      error: { message: "insert failed" },
    });
    mockUpdateUserById.mockResolvedValue({
      data: null,
      error: { message: "ban failed" },
    });

    const { disableUser } = await import("@/lib/actions/admin");
    await expect(disableUser("user-2")).rejects.toThrow(
      "club memberships could not be restored",
    );
  });
});

describe("enableUser", () => {
  it("lifts the ban", async () => {
    mockUpdateUserById.mockResolvedValue({ data: {}, error: null });

    const { enableUser } = await import("@/lib/actions/admin");
    await enableUser("user-2");

    expect(mockUpdateUserById).toHaveBeenCalledWith("user-2", {
      ban_duration: "none",
    });
  });

  it("throws when lifting the ban fails", async () => {
    mockUpdateUserById.mockResolvedValue({
      data: null,
      error: { message: "unban failed" },
    });

    const { enableUser } = await import("@/lib/actions/admin");
    await expect(enableUser("user-2")).rejects.toThrow("unban failed");
  });
});
