"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isRootDomain } from "@/lib/tenant";
import type { Organization, UserWithMemberships } from "@/lib/types/domain";

async function requireMasterAdmin() {
  const rootDomain = await isRootDomain();
  if (!rootDomain) throw new Error("Not on root domain");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  if (!user.user_metadata?.is_master_admin)
    throw new Error("Not a master admin");
  return { supabase, user };
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export async function getOrganizations(): Promise<Organization[]> {
  const { supabase } = await requireMasterAdmin();
  const { data, error } = await supabase
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
  const { supabase, user } = await requireMasterAdmin();

  if (!SLUG_REGEX.test(slug) || slug.length < 2) {
    throw new Error(
      "Invalid slug: must be lowercase alphanumeric with hyphens, at least 2 characters",
    );
  }

  const { data, error } = await supabase
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
  const { supabase } = await requireMasterAdmin();
  const { data, error } = await supabase
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
  const { supabase } = await requireMasterAdmin();
  const serviceClient = createServiceClient();

  // Check if user already exists
  const { data: existingUsers } = await serviceClient.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find((u) => u.email === email);

  if (existingUser) {
    // Add to org directly
    const { error } = await supabase.from("organization_members").insert({
      organization_id: organizationId,
      user_id: existingUser.id,
      role: "planner",
    });
    if (error) throw new Error(error.message);
  } else {
    // Invite via Supabase auth (sends magic link)
    const { error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      data: { invited_to_org: organizationId },
    });
    if (error) throw new Error(error.message);
  }
}

export async function getUsers(): Promise<UserWithMemberships[]> {
  const { supabase } = await requireMasterAdmin();
  const serviceClient = createServiceClient();

  // Get all users via admin API
  const { data: authUsers } = await serviceClient.auth.admin.listUsers();

  // Get all memberships with organization info
  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("*, organizations(name, slug)");

  if (error) throw new Error(error.message);

  // Map users with their memberships
  return (authUsers?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    created_at: u.created_at,
    is_master_admin: u.user_metadata?.is_master_admin === true,
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
  const { supabase } = await requireMasterAdmin();
  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("user_id", userId)
    .eq("organization_id", organizationId);
  if (error) throw new Error(error.message);
}
