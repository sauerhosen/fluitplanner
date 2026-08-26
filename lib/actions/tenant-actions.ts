"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getTenantId } from "@/lib/tenant";

export type UserOrganization = {
  slug: string;
  name: string;
  role: string;
};

export async function getUserOrganizations(): Promise<UserOrganization[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("organization_members")
    .select("role, organizations(name, slug)")
    .eq("user_id", user.id);

  if (!data) return [];

  return data
    .filter((m) => m.organizations)
    .map((m) => {
      const org = m.organizations as unknown as { name: string; slug: string };
      return { slug: org.slug, name: org.name, role: m.role };
    });
}

export async function switchOrganization(slug: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Verify user is a member of the target org
  const { data: membership } = await supabase
    .from("organization_members")
    .select("id, organizations!inner(slug)")
    .eq("user_id", user.id)
    .eq("organizations.slug", slug)
    .maybeSingle();

  if (!membership) throw new Error("Not a member of this organization");

  const store = await cookies();
  store.set("x-tenant", slug, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * Name of the organization the current request is scoped to, or null when
 * there is no tenant context (root domain) or the lookup fails.
 */
export async function getCurrentOrganizationName(): Promise<string | null> {
  const tenantId = await getTenantId();
  if (!tenantId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", tenantId)
    .maybeSingle();

  return data?.name ?? null;
}
