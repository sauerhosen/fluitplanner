import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { UpdatePasswordForm } from "@/components/update-password-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  // /auth/confirm has already redeemed the token and set the session cookies by
  // the time we get here. Without a session `updateUser` would fail deep in the
  // form with a raw "Auth session missing!", so catch the expired/reused-link
  // case up front and say so plainly.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const t = await getTranslations("auth");
  const { type } = await searchParams;
  // An invited user is choosing a first password, not resetting a forgotten one.
  const isInvite = type === "invite";

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        {user ? (
          <UpdatePasswordForm
            title={isInvite ? t("choosePasswordTitle") : undefined}
            description={isInvite ? t("choosePasswordDescription") : undefined}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                {t("linkInvalidTitle")}
              </CardTitle>
              <CardDescription>{t("linkInvalidDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href="/auth/forgot-password">{t("requestNewLink")}</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
