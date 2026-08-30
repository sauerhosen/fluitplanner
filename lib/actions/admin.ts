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
    app_metadata?: Record<string, unknown>;
  }> = [];
  let page = 1;
  const perPage = 1000;
  while (true) {
    const {
      data: { users },
    } = await serviceClient.auth.admin.listUsers({ page, perPage });
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
  await requireMasterAdmin();
  const serviceClient = createServiceClient();

  await requirePendingUser(serviceClient, userId);
  await deleteAuthUserWithMemberships(serviceClient, userId);
}

export async function deleteUser(userId: string): Promise<void> {
  const { user } = await requireMasterAdmin();
  if (user.id === userId) {
    throw new Error("You cannot delete your own account");
  }

  const serviceClient = createServiceClient();
  await deleteAuthUserWithMemberships(serviceClient, userId);
}

/**
 * Memberships reference auth.users without a cascade, so they have to go first.
 * Other tables (matches, umpires, organizations) reference auth.users through
 * `created_by` and are deliberately *not* cascaded — deleting a planner must
 * never silently take their club's data with it.
 */
async function deleteAuthUserWithMemberships(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<void> {
  const { error: membershipError } = await serviceClient
    .from("organization_members")
    .delete()
    .eq("user_id", userId);
  if (membershipError) throw new Error(membershipError.message);

  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  if (error) {
    const isForeignKeyViolation =
      (error as { code?: string }).code === "23503" ||
      error.message.includes("foreign key constraint");
    if (isForeignKeyViolation) {
      throw new Error(
        "This user created matches or umpires that still exist. Remove them from their clubs instead of deleting the account.",
      );
    }
    throw new Error(error.message);
  }
}
