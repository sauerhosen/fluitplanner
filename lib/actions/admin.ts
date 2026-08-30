"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isRootDomain } from "@/lib/tenant";
import type {
  Organization,
  UserMembership,
  UserWithMemberships,
} from "@/lib/types/domain";

async function requireMasterAdmin() {
  const rootDomain = await isRootDomain();
  if (!rootDomain) throw new Error("Not on root domain");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  // The flag lives in app_metadata, which only the service role key can write.
  // user_metadata is writable by the user itself and must never be trusted here.
  if (!user.app_metadata?.is_master_admin)
    throw new Error("Not a master admin");
  return { supabase, user };
}

const MEMBER_ROLES = ["planner", "viewer"] as const;

/**
 * GoTrue bans are expressed as a duration, so "indefinite" is spelled as a
 * century. `ban_duration: "none"` lifts it again.
 */
const INDEFINITE_BAN = "876000h";

/**
 * Fetch every auth user, paginating past the 1000-per-page admin API limit.
 */
async function listAllAuthUsers(
  serviceClient: ReturnType<typeof createServiceClient>,
) {
  const all: Array<{
    id: string;
    email?: string;
    created_at: string;
    email_confirmed_at?: string | null;
    banned_until?: string | null;
    app_metadata?: Record<string, unknown>;
  }> = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    // On failure the admin client resolves with an empty user list rather than
    // rejecting, so the error has to be checked — otherwise an outage looks
    // exactly like "this deployment has no accounts".
    const { data, error } = await serviceClient.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    all.push(...users);
    if (users.length < perPage) break;
    page++;
  }
  return all;
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export async function getOrganizations(): Promise<Organization[]> {
  await requireMasterAdmin();
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("organizations")
    .select("*")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createOrganization(
  name: string,
  slug: string,
): Promise<Organization> {
  const { user } = await requireMasterAdmin();
  const serviceClient = createServiceClient();

  if (!SLUG_REGEX.test(slug) || slug.length < 2) {
    throw new Error(
      "Invalid slug: must be lowercase alphanumeric with hyphens, at least 2 characters",
    );
  }

  const { data, error } = await serviceClient
    .from("organizations")
    .insert({ name, slug, created_by: user.id })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateOrganization(
  id: string,
  updates: { name?: string; is_active?: boolean },
): Promise<Organization> {
  await requireMasterAdmin();
  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("organizations")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function invitePlanner(
  organizationId: string,
  email: string,
): Promise<void> {
  await requireMasterAdmin();
  const serviceClient = createServiceClient();

  // Check if user already exists (paginate to handle >1000 users)
  const allUsers = await listAllAuthUsers(serviceClient);
  const existingUser = allUsers.find((u) => u.email === email);

  if (existingUser) {
    // Add to org directly
    const { error } = await serviceClient.from("organization_members").insert({
      organization_id: organizationId,
      user_id: existingUser.id,
      role: "planner",
    });
    if (error) throw new Error(error.message);
  } else {
    // Invite via Supabase auth (sends magic link)
    const { data: inviteData, error } =
      await serviceClient.auth.admin.inviteUserByEmail(email);
    if (error) throw new Error(error.message);

    // Store invited_to_org in app_metadata (admin-only writable, not spoofable)
    if (inviteData?.user) {
      await serviceClient.auth.admin.updateUserById(inviteData.user.id, {
        app_metadata: { invited_to_org: organizationId },
      });
    }
  }
}

export async function getUsers(): Promise<UserWithMemberships[]> {
  await requireMasterAdmin();
  const serviceClient = createServiceClient();

  // Get all users via admin API (paginate to handle >1000 users)
  const allAuthUsers = await listAllAuthUsers(serviceClient);

  // Get all memberships with organization info (service client to see all orgs)
  const { data: memberships, error } = await serviceClient
    .from("organization_members")
    .select("*, organizations(name, slug)");

  if (error) throw new Error(error.message);

  // Map users with their memberships
  return allAuthUsers.map((u) => ({
    id: u.id,
    email: u.email ?? "",
    created_at: u.created_at,
    is_master_admin: u.app_metadata?.is_master_admin === true,
    // Invited but never confirmed — the invite is still outstanding.
    is_pending_invite: !u.email_confirmed_at,
    is_disabled: isBanned(u.banned_until),
    memberships: (memberships ?? [])
      .filter((m) => m.user_id === u.id)
      .map((m) => ({
        organization_id: m.organization_id,
        organization_name:
          (m.organizations as { name: string; slug: string })?.name ?? "",
        organization_slug:
          (m.organizations as { name: string; slug: string })?.slug ?? "",
        role: m.role,
      })),
  }));
}

export async function removeUserFromOrg(
  userId: string,
  organizationId: string,
): Promise<void> {
  await requireMasterAdmin();
  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from("organization_members")
    .delete()
    .eq("user_id", userId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
}

export async function updateMemberRole(
  userId: string,
  organizationId: string,
  role: UserMembership["role"],
): Promise<void> {
  await requireMasterAdmin();

  if (!MEMBER_ROLES.includes(role)) {
    throw new Error(`Invalid role: must be one of ${MEMBER_ROLES.join(", ")}`);
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from("organization_members")
    .update({ role })
    .eq("user_id", userId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
}

/**
 * Load a user and refuse to continue if they have already confirmed their
 * email — resending or revoking an invite only makes sense while it is pending.
 */
async function requirePendingUser(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
) {
  const { data, error } = await serviceClient.auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);
  const user = data?.user;
  if (!user) throw new Error("User not found");
  if (user.email_confirmed_at) {
    throw new Error("User has already accepted their invite");
  }
  return user;
}

export async function resendInvite(userId: string): Promise<void> {
  await requireMasterAdmin();
  const serviceClient = createServiceClient();

  const user = await requirePendingUser(serviceClient, userId);
  if (!user.email) throw new Error("User has no email address");

  const invitedToOrg = user.app_metadata?.invited_to_org ?? null;

  const { error } = await serviceClient.auth.admin.inviteUserByEmail(
    user.email,
  );
  if (error) throw new Error(error.message);

  // Re-stamp the target org so /auth/confirm can still auto-join them.
  if (invitedToOrg) {
    await serviceClient.auth.admin.updateUserById(userId, {
      app_metadata: { invited_to_org: invitedToOrg },
    });
  }
}

export async function revokePendingInvite(userId: string): Promise<void> {
  const { user } = await requireMasterAdmin();
  // Revoking deletes the account, so it needs the same self-protection as
  // deleteUser — a master admin whose own email was never confirmed shows up
  // as a pending invite too.
  if (user.id === userId) {
    throw new Error("You cannot revoke your own invite");
  }

  const serviceClient = createServiceClient();

  await requirePendingUser(serviceClient, userId);
  const memberships = await readAllMemberships(serviceClient, userId);
  await removeAllMemberships(serviceClient, userId);

  // A pending invite has never signed in, so it cannot own records — a
  // foreign-key failure here is a real error, not a reason to disable.
  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  if (error) {
    const restored = await restoreMemberships(
      serviceClient,
      userId,
      memberships,
    );
    throw new Error(failedDeleteMessage(error.message, restored));
  }
}

/**
 * `deleted` — the account is gone.
 * `disabled` — the account still owns records (matches, umpires, clubs it
 * created), so it was banned and stripped of its memberships instead.
 */
export type DeleteUserResult = { outcome: "deleted" | "disabled" };

export async function deleteUser(userId: string): Promise<DeleteUserResult> {
  const { user } = await requireMasterAdmin();
  if (user.id === userId) {
    throw new Error("You cannot delete your own account");
  }

  const serviceClient = createServiceClient();
  // Memberships are themselves a blocking reference, so they have to go before
  // the delete can be attempted — snapshot them so they can be put back if the
  // delete then fails for an unrelated reason.
  const memberships = await readAllMemberships(serviceClient, userId);
  await removeAllMemberships(serviceClient, userId);

  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  if (!error) return { outcome: "deleted" };

  // GoTrue collapses every database failure into a generic 500, so the error
  // itself cannot tell a blocking reference apart from an outage. Ask Postgres.
  const { data: stillReferenced, error: probeError } = await serviceClient.rpc(
    "auth_user_is_referenced",
    { target_user: userId },
  );
  if (probeError || !stillReferenced) {
    // The account survives, so it must not be left stranded without its clubs.
    const restored = await restoreMemberships(
      serviceClient,
      userId,
      memberships,
    );
    throw new Error(failedDeleteMessage(error.message, restored));
  }

  // `created_by` on matches, umpires, polls and clubs references auth.users
  // with no cascade — deliberately, so deleting a planner never takes their
  // club's data with it. Disable instead: the rows keep a valid owner, and the
  // account can no longer sign in or belong to a club.
  await banUser(serviceClient, userId);
  return { outcome: "disabled" };
}

export async function disableUser(userId: string): Promise<void> {
  const { user } = await requireMasterAdmin();
  if (user.id === userId) {
    throw new Error("You cannot disable your own account");
  }

  const serviceClient = createServiceClient();
  await banUser(serviceClient, userId);
  await removeAllMemberships(serviceClient, userId);
}

/**
 * Lifts the ban so the account can sign in again. Club memberships are not
 * restored — a re-enabled user has to be invited back to their clubs, the same
 * as any other returning account.
 */
export async function enableUser(userId: string): Promise<void> {
  await requireMasterAdmin();
  const serviceClient = createServiceClient();

  const { error } = await serviceClient.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (error) throw new Error(error.message);
}

function isBanned(bannedUntil: string | null | undefined): boolean {
  if (!bannedUntil) return false;
  const until = new Date(bannedUntil).getTime();
  return Number.isFinite(until) && until > Date.now();
}

async function banUser(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<void> {
  const { error } = await serviceClient.auth.admin.updateUserById(userId, {
    ban_duration: INDEFINITE_BAN,
  });
  if (error) throw new Error(error.message);
}

type MembershipSnapshot = { organization_id: string; role: string };

/**
 * Snapshot a user's club memberships so a delete that had to clear them can put
 * them back when it turns out the account is staying.
 */
async function readAllMemberships(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<MembershipSnapshot[]> {
  const { data, error } = await serviceClient
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as MembershipSnapshot[];
}

/**
 * Puts a snapshot back. Returns false if it could not — the caller is already
 * throwing, and an admin whose user is now stranded without clubs needs to be
 * told that rather than left to discover it.
 */
async function restoreMemberships(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
  memberships: MembershipSnapshot[],
): Promise<boolean> {
  if (memberships.length === 0) return true;
  const { error } = await serviceClient
    .from("organization_members")
    .insert(memberships.map((m) => ({ ...m, user_id: userId })));
  return !error;
}

/**
 * The message for a failed delete, widened when the compensating restore also
 * failed and the account is left without its club memberships.
 */
function failedDeleteMessage(originalMessage: string, restored: boolean) {
  return restored
    ? originalMessage
    : `${originalMessage}. The account's club memberships could not be restored and must be added again.`;
}

/**
 * Memberships reference auth.users without a cascade, so they have to go before
 * any delete attempt — and a disabled account should not sit on a club roster
 * either.
 */
async function removeAllMemberships(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<void> {
  const { error } = await serviceClient
    .from("organization_members")
    .delete()
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}
