import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PasskeyButton } from "@/components/passkey/passkey-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getBaseDomain } from "@/lib/base-domain";
import { safePasskeyReturnUrl } from "@/lib/passkey/ceremony-url";
import type { PasskeyMode } from "@/lib/passkey/run";
import { createClient } from "@/lib/supabase/server";

/** Current origin, so the ceremony can validate `next` against where it runs. */
async function currentOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/**
 * The one page allowed to run a WebAuthn ceremony.
 *
 * GoTrue checks the ceremony's origin against `rp_origins`, an exact-match list
 * capped at five entries, so with a subdomain per club there is only room for
 * the apex. Club pages bounce here and come back — see `docs/passkeys.md`.
 *
 * The button is explicit rather than firing on mount: arriving by redirect
 * carries no user activation, which some browsers require for
 * `navigator.credentials`.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string | string[]; next?: string | string[] }>;
}) {
  const { mode: rawMode, next: rawNext } = await searchParams;
  const modeValue = Array.isArray(rawMode) ? rawMode[0] : rawMode;
  const mode: PasskeyMode = modeValue === "enroll" ? "enroll" : "signin";

  const origin = await currentOrigin();
  const returnUrl = safePasskeyReturnUrl(rawNext, getBaseDomain(), origin);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (mode === "enroll" && !user) {
    // Reached by a user whose session is still host-only, from before the auth
    // cookie was widened to the base domain — so they arrive here signed out.
    // Sign them in on this origin, then resume the enrolment.
    const resume = `/auth/passkey?mode=enroll&next=${encodeURIComponent(returnUrl)}`;
    redirect(`/auth/login?next=${encodeURIComponent(resume)}`);
  }

  if (mode === "signin" && user) {
    redirect(returnUrl);
  }

  const t = await getTranslations("auth");

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">
              {mode === "enroll" ? t("passkeyEnrollTitle") : t("passkeyTitle")}
            </CardTitle>
            <CardDescription>
              {mode === "enroll"
                ? t("passkeyEnrollDescription")
                : t("passkeyDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* forceInline: this *is* the ceremony page, so bouncing again
                would loop if the configured origin disagrees with the host's
                canonical one. Running here surfaces a real error instead. */}
            <PasskeyButton
              mode={mode}
              returnUrl={returnUrl}
              forceInline
              variant="default"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
