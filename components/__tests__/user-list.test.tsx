import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UserList } from "@/components/admin/user-list";
import type { Organization, UserWithMemberships } from "@/lib/types/domain";

const getUsers = vi.fn();
const removeUserFromOrg = vi.fn();
const updateMemberRole = vi.fn();
const resendInvite = vi.fn();
const revokePendingInvite = vi.fn();
const deleteUser = vi.fn();
const disableUser = vi.fn();
const enableUser = vi.fn();

vi.mock("@/lib/actions/admin", () => ({
  getUsers: (...args: unknown[]) => getUsers(...args),
  removeUserFromOrg: (...args: unknown[]) => removeUserFromOrg(...args),
  updateMemberRole: (...args: unknown[]) => updateMemberRole(...args),
  resendInvite: (...args: unknown[]) => resendInvite(...args),
  revokePendingInvite: (...args: unknown[]) => revokePendingInvite(...args),
  deleteUser: (...args: unknown[]) => deleteUser(...args),
  disableUser: (...args: unknown[]) => disableUser(...args),
  enableUser: (...args: unknown[]) => enableUser(...args),
  invitePlanner: vi.fn(),
}));

const organizations: Organization[] = [
  {
    id: "org-1",
    name: "Club Alpha",
    slug: "club-alpha",
    is_active: true,
    created_at: "2026-01-01",
    created_by: "user-1",
  },
];

function user(overrides: Partial<UserWithMemberships>): UserWithMemberships {
  return {
    id: "user-2",
    email: "planner@example.com",
    created_at: "2026-01-02",
    is_master_admin: false,
    is_pending_invite: false,
    is_disabled: false,
    memberships: [
      {
        organization_id: "org-1",
        organization_name: "Club Alpha",
        organization_slug: "club-alpha",
        role: "planner",
      },
    ],
    ...overrides,
  };
}

function renderList(users: UserWithMemberships[]) {
  return render(
    <UserList
      users={users}
      organizations={organizations}
      currentUserId="user-1"
    />,
  );
}

async function openRowMenu(email: string) {
  await userEvent.click(
    screen.getByRole("button", { name: `Actions for ${email}` }),
  );
}

beforeEach(() => {
  getUsers.mockResolvedValue([]);
  removeUserFromOrg.mockResolvedValue(undefined);
  updateMemberRole.mockResolvedValue(undefined);
  resendInvite.mockResolvedValue(undefined);
  revokePendingInvite.mockResolvedValue(undefined);
  deleteUser.mockResolvedValue({ outcome: "deleted" });
  disableUser.mockResolvedValue(undefined);
  enableUser.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UserList", () => {
  it("offers a primary action to invite someone who has no account yet", async () => {
    renderList([user({})]);

    await userEvent.click(
      screen.getByRole("button", { name: /Invite Planner/i }),
    );

    // Opens with an empty address, rather than prefilled from a row
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Email address")).toHaveValue("");
  });

  it("still offers the invite action when there are no users at all", async () => {
    renderList([]);

    expect(screen.getByText("No users found.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Invite Planner/i }),
    ).toBeInTheDocument();
  });

  it("prefills the address when inviting an existing user to another club", async () => {
    renderList([user({})]);
    await openRowMenu("planner@example.com");
    await userEvent.click(screen.getByText("Invite to organization"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Email address")).toHaveValue(
      "planner@example.com",
    );
  });

  it("changes a member's role within an organization", async () => {
    renderList([user({})]);
    await openRowMenu("planner@example.com");
    // The club name appears both as a membership badge and as the submenu
    // trigger — target the menu item.
    await userEvent.click(screen.getByRole("menuitem", { name: "Club Alpha" }));
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: "Viewer" }),
    );

    await waitFor(() =>
      expect(updateMemberRole).toHaveBeenCalledWith(
        "user-2",
        "org-1",
        "viewer",
      ),
    );
  });

  it("offers resend and revoke only while an invite is pending", async () => {
    renderList([user({ is_pending_invite: true })]);
    expect(screen.getByText("Pending invite")).toBeInTheDocument();

    await openRowMenu("planner@example.com");
    expect(screen.getByText("Resend invite")).toBeInTheDocument();
    expect(screen.getByText("Revoke invite")).toBeInTheDocument();
  });

  it("hides resend and revoke for a user who has accepted", async () => {
    renderList([user({})]);
    await openRowMenu("planner@example.com");

    expect(screen.queryByText("Resend invite")).not.toBeInTheDocument();
    expect(screen.queryByText("Revoke invite")).not.toBeInTheDocument();
  });

  it("does not offer to delete the signed-in admin's own account", async () => {
    renderList([
      user({ id: "user-1", email: "me@example.com", is_master_admin: true }),
    ]);
    await openRowMenu("me@example.com");

    expect(screen.queryByText("Delete user")).not.toBeInTheDocument();
  });

  it("deletes another user after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderList([user({})]);
    await openRowMenu("planner@example.com");
    await userEvent.click(screen.getByText("Delete user"));

    await waitFor(() => expect(deleteUser).toHaveBeenCalledWith("user-2"));
  });

  it("says so when a delete became a disable", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteUser.mockResolvedValue({ outcome: "disabled" });

    renderList([user({})]);
    await openRowMenu("planner@example.com");
    await userEvent.click(screen.getByText("Delete user"));

    expect(
      await screen.findByText(
        "planner@example.com created matches or umpires that still exist, so the account was disabled instead of deleted.",
      ),
    ).toBeInTheDocument();
  });

  it("surfaces the reason an action failed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteUser.mockRejectedValue(new Error("auth service unavailable"));

    renderList([user({})]);
    await openRowMenu("planner@example.com");
    await userEvent.click(screen.getByText("Delete user"));

    expect(
      await screen.findByText("auth service unavailable"),
    ).toBeInTheDocument();
  });

  it("disables another user after confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderList([user({})]);
    await openRowMenu("planner@example.com");
    await userEvent.click(screen.getByText("Disable user"));

    await waitFor(() => expect(disableUser).toHaveBeenCalledWith("user-2"));
  });

  it("offers only enable and delete for a disabled account", async () => {
    renderList([user({ is_disabled: true, memberships: [] })]);
    expect(screen.getByText("Disabled")).toBeInTheDocument();

    await openRowMenu("planner@example.com");

    expect(screen.getByText("Enable user")).toBeInTheDocument();
    expect(screen.getByText("Delete user")).toBeInTheDocument();
    expect(screen.queryByText("Disable user")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Invite to organization"),
    ).not.toBeInTheDocument();
  });

  it("re-enables a disabled account", async () => {
    renderList([user({ is_disabled: true, memberships: [] })]);
    await openRowMenu("planner@example.com");
    await userEvent.click(screen.getByText("Enable user"));

    await waitFor(() => expect(enableUser).toHaveBeenCalledWith("user-2"));
  });

  it("warns when the list could not be reloaded after a change", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    getUsers.mockRejectedValue(new Error("network down"));

    renderList([user({})]);
    await openRowMenu("planner@example.com");
    await userEvent.click(screen.getByText("Delete user"));

    expect(
      await screen.findByText(
        "Done, but the list could not be refreshed. Reload the page to see the current state.",
      ),
    ).toBeInTheDocument();
  });

  it("does not offer to disable the signed-in admin's own account", async () => {
    renderList([
      user({ id: "user-1", email: "me@example.com", is_master_admin: true }),
    ]);
    await openRowMenu("me@example.com");

    expect(screen.queryByText("Disable user")).not.toBeInTheDocument();
  });
});
