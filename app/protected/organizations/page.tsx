import { redirect } from "next/navigation";
import { isRootDomain } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getOrganizations } from "@/lib/actions/admin";
import { getTranslations } from "next-intl/server";
import { OrganizationList } from "@/components/admin/organization-list";
import { PageHeader } from "@/components/shared/page-header";

export default async function OrganizationsPage() {
  const [rootDomain, supabase] = await Promise.all([
    isRootDomain(),
    createClient(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!rootDomain || !user?.user_metadata?.is_master_admin)
    redirect("/protected");

  const [t, organizations] = await Promise.all([
    getTranslations("admin"),
    getOrganizations(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <h1 className="truncate text-xl font-semibold">
            {t("organizations")}
          </h1>
        }
      />
      <OrganizationList organizations={organizations} />
    </div>
  );
}
