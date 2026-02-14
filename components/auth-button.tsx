import Link from "next/link";
import { Button } from "./ui/button";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "./logout-button";
import { getTranslations } from "next-intl/server";

export async function AuthButton({
  showDashboardLink = false,
}: {
  showDashboardLink?: boolean;
} = {}) {
  const supabase = await createClient();
  const t = await getTranslations("auth");
  const tNav = await getTranslations("nav");

  // You can also use getUser() which will be slower.
  const { data } = await supabase.auth.getClaims();

  const user = data?.claims;

  return user ? (
    <div className="flex items-center gap-2 sm:gap-4">
      <span className="hidden sm:inline text-sm">
        {t("greeting", { email: user.email as string })}
      </span>
      {showDashboardLink && (
        <Button asChild size="sm" variant={"default"}>
          <Link href="/protected">{tNav("dashboard")}</Link>
        </Button>
      )}
      <LogoutButton />
    </div>
  ) : (
    <div className="flex gap-2">
      <Button asChild size="sm" variant={"outline"}>
        <Link href="/auth/login">{t("signIn")}</Link>
      </Button>
      <Button asChild size="sm" variant={"default"}>
        <Link href="/auth/sign-up">{t("signUpLink")}</Link>
      </Button>
    </div>
  );
}
