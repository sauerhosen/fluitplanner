import { AppLink } from "@/components/shared/app-link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";
import { getTranslations } from "next-intl/server";

export async function AuthButton({
  showDashboardLink = false,
}: {
  showDashboardLink?: boolean;
} = {}) {
  const [supabase, t, tNav] = await Promise.all([
    createClient(),
    getTranslations("auth"),
    getTranslations("nav"),
  ]);

  // You can also use getUser() which will be slower.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;

  return user ? (
    <div className="flex items-center gap-2 sm:gap-4">
      <AppLink
        href="/protected/account"
        className="hidden sm:inline text-sm hover:underline"
      >
        {t("greeting", { email: user.email as string })}
      </AppLink>
      {showDashboardLink && (
        <Button asChild size="sm" variant={"default"}>
          <AppLink href="/protected">{tNav("dashboard")}</AppLink>
        </Button>
      )}
      <LogoutButton />
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"}>
        <AppLink href="/auth/login">{t("signIn")}</AppLink>
      </Button>
      <Button asChild size="sm" variant={"default"}>
        <AppLink href="/auth/sign-up">{t("signUpLink")}</AppLink>
      </Button>
    </div>
  );
}
