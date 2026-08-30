import { redirect } from "next/navigation";
import { isRootDomain } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getUsers, getOrganizations } from "@/lib/actions/admin";
import { UserList } from "@/components/admin/user-list";

export default async function UsersPage() {
  const [rootDomain, supabase] = await Promise.all([
    isRootDomain(),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!rootDomain || !user?.app_metadata?.is_master_admin)
    redirect("/protected");

  const [users, organizations] = await Promise.all([
    getUsers(),
    getOrganizations(),
  ]);

  // UserList renders the page header: the invite dialog behind its primary
  // action shares the same state as the row-level actions.
  return (
    <UserList
      users={users}
      organizations={organizations}
      currentUserId={user.id}
    />
  );
}
