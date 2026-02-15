import { AuthButton } from "@/components/auth-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import Image from "next/image";
import Link from "next/link";
import appIcon from "@/app/icon.png";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { isRootDomain } from "@/lib/tenant";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [t, isRoot] = await Promise.all([
    getTranslations("nav"),
    isRootDomain(),
  ]);

  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col gap-20 items-center">
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-12 sm:h-16">
          <div className="w-full max-w-5xl flex justify-between items-center p-3 px-4 sm:px-5 text-sm">
            <div className="flex gap-3 sm:gap-5 items-center font-semibold">
              <Link href="/protected">
                <Image
                  src={appIcon}
                  alt="Fluitplanner"
                  className="h-6 w-6 sm:h-7 sm:w-7 rounded"
                />
              </Link>
              <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm font-normal">
                <Link href="/protected/matches" className="hover:underline">
                  {t("matches")}
                </Link>
                <Link href="/protected/polls" className="hover:underline">
                  {t("polls")}
                </Link>
                <Link href="/protected/umpires" className="hover:underline">
                  {t("umpires")}
                </Link>
                {isRoot && (
                  <>
                    <Link
                      href="/protected/organizations"
                      className="hover:underline hidden sm:inline"
                    >
                      {t("organizations")}
                    </Link>
                    <Link
                      href="/protected/users"
                      className="hover:underline hidden sm:inline"
                    >
                      {t("users")}
                    </Link>
                  </>
                )}
                <Link
                  href="/protected/settings"
                  className="hover:underline hidden sm:inline"
                >
                  {t("settings")}
                </Link>
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
        <div className="flex-1 flex flex-col gap-20 w-full max-w-5xl p-5 overflow-hidden">
          {children}
        </div>

        <footer className="w-full flex items-center justify-center border-t mx-auto text-center text-xs gap-8 py-8">
          <p className="text-muted-foreground">Fluitplanner</p>
          <Link
            href="/privacy"
            className="text-muted-foreground hover:underline"
          >
            {t("privacy")}
          </Link>
          <ThemeSwitcher />
          <LanguageSwitcher />
        </footer>
      </div>
    </main>
  );
}
