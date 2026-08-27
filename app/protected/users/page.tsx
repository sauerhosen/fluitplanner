import { redirect } from "next/navigation";
import { isRootDomain } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getUsers, getOrganizations } from "@/lib/actions/admin";
import { getTranslations } from "next-intl/server";
import { UserList } from "@/components/admin/user-list";
import { PageHeader } from "@/components/shared/page-header";

export default async function UsersPage() {
  const [rootDomain, supabase] = await Promise.all([
    isRootDomain(),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!rootDomain || !user?.user_metadata?.is_master_admin)
    redirect("/protected");

  const [t, users, organizations] = await Promise.all([
    getTranslations("admin"),
    getUsers(),
    getOrganizations(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={<h1 className="truncate text-xl font-semibold">{t("users")}</h1>}
      />
      <UserList users={users} organizations={organizations} />
    </div>
  );
}
