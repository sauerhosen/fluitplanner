import { getTranslations } from "next-intl/server";

import {
  PasskeySettings,
  type PasskeyInfo,
} from "@/components/account/passkey-settings";
import { PageHeader } from "@/components/shared/page-header";
import { requireAuthContext } from "@/lib/auth";

/**
 * Per-user account settings.
 *
 * Gated with `requireAuthContext()` rather than `requireMember()` or
 * `requirePlanner()`: passkeys belong to the person, not the club, so a viewer
 * must reach this page — and a master admin on the root domain may have no club
 * membership at all, which the tenant-resolving gates would throw on.
 */
export default async function AccountPage() {
  const { supabase, user } = await requireAuthContext();
  const t = await getTranslations("account");

  let passkeys: PasskeyInfo[] = [];
  let listFailed = false;
  try {
    const { data, error } = await supabase.auth.passkey.list();
    if (error) throw error;
    passkeys = data ?? [];
  } catch (err) {
    // Listing is a nicety — enrolment still works without it, so the page
    // degrades rather than erroring out.
    console.error("account: could not list passkeys", err);
    listFailed = true;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={
          <h1 className="truncate text-xl font-semibold">{t("pageTitle")}</h1>
        }
      />
      <div>
        <h2 className="mb-1 text-lg font-semibold">{t("signedInAs")}</h2>
        <p className="text-muted-foreground text-sm">{user.email}</p>
      </div>
      <div>
        <h2 className="mb-4 text-lg font-semibold">{t("passkeysTitle")}</h2>
        <PasskeySettings passkeys={passkeys} listFailed={listFailed} />
      </div>
    </div>
  );
}
