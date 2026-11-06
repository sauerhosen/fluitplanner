import { AuthButton } from "@/components/auth-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { OrganizationSwitcher } from "@/components/organization-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import Image from "next/image";
import { AppLink } from "@/components/shared/app-link";
import appIcon from "@/app/icon.png";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { isRootDomain, getTenantSlug } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { getMembershipRole } from "@/lib/auth";
import { RoleProvider } from "@/components/shared/role-provider";
import { UserRound } from "lucide-react";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [t, isRoot, tenantSlug, supabase, role] = await Promise.all([
    getTranslations("nav"),
    isRootDomain(),
    getTenantSlug(),
    createClient(),
    getMembershipRole(),
  ]);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isMasterAdmin = isRoot && !!user?.app_metadata?.is_master_admin;

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-8 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-12 sm:h-16">
          <div className="w-full max-w-7xl flex justify-between items-center p-3 px-4 sm:px-5 text-sm">
            <div className="flex gap-3 sm:gap-5 items-center font-semibold">
              <AppLink href="/protected">
                <Image
                  src={appIcon}
                  alt="Fluitplanner"
                  className="h-6 w-6 sm:h-7 sm:w-7 rounded"
                />
              </AppLink>
              <OrganizationSwitcher currentSlug={tenantSlug} />
              {role === "viewer" && (
                <span
                  className="rounded-full border px-2 py-0.5 text-[10px] sm:text-xs font-medium text-muted-foreground"
                  title={t("readOnlyHint")}
                >
                  {t("readOnly")}
                </span>
              )}
              <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm font-normal">
                <AppLink href="/protected/matches" className="hover:underline">
                  {t("matches")}
                </AppLink>
                <AppLink href="/protected/polls" className="hover:underline">
                  {t("polls")}
                </AppLink>
                <AppLink href="/protected/umpires" className="hover:underline">
                  {t("umpires")}
                </AppLink>
                {isMasterAdmin && (
                  <>
                    <AppLink
                      href="/protected/organizations"
                      className="hover:underline hidden sm:inline"
                    >
                      {t("organizations")}
                    </AppLink>
                    <AppLink
                      href="/protected/users"
                      className="hover:underline hidden sm:inline"
                    >
                      {t("users")}
                    </AppLink>
                  </>
                )}
                <AppLink
                  href="/protected/settings"
                  className="hover:underline hidden sm:inline"
                >
                  {t("settings")}
                </AppLink>
                {/* Account is per-user, so unlike the club pages it stays
                    reachable on mobile — as an icon, to keep the row short. */}
                <AppLink
                  href="/protected/account"
                  className="hover:underline"
                  aria-label={t("account")}
                >
                  <UserRound className="size-4 sm:hidden" aria-hidden="true" />
                  <span className="hidden sm:inline">{t("account")}</span>
                </AppLink>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <LanguageSwitcher />
              <Suspense>
                <AuthButton />
              </Suspense>
            </div>
          </div>
        </nav>
        {/* overflow-x-clip, not overflow-hidden: clip contains the wide grids
            without making this a scroll container, which would break every
            sticky toolbar inside it. */}
        <div className="flex-1 flex flex-col gap-20 w-full max-w-7xl p-5 overflow-x-clip">
          <RoleProvider role={role}>{children}</RoleProvider>
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-8">
          <p className="text-muted-foreground">Fluitplanner</p>
          <AppLink
            href="/privacy"
            className="text-muted-foreground hover:underline"
          >
            {t("privacy")}
          </AppLink>
          <ThemeSwitcher />
          <LanguageSwitcher />
        </footer>
      </div>
    </main>
  );
}
