"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getBaseDomain } from "@/lib/base-domain";
import {
  passkeyCeremonyOrigin,
  passkeysAvailable,
} from "@/lib/passkey/ceremony-url";
import {
  browserSupportsPasskeys,
  isPasskeyCancellation,
  runPasskeyCeremony,
  type PasskeyMode,
} from "@/lib/passkey/run";

/** Support never changes within a page's life, so there is nothing to subscribe to. */
const subscribeToNothing = () => () => {};

type Props = {
  mode: PasskeyMode;
  /**
   * Absolute URL to land on afterwards. Only the ceremony page sets this, with
   * the `next` it has already validated; entry points use `returnPath`.
   */
  returnUrl?: string;
  /**
   * Same-site path to come back to, resolved against the current origin.
   * Defaults to `/protected` for sign-in and to the current page for enrolment.
   */
  returnPath?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
  onEnrolled?: () => void;
};

/**
 * Runs a passkey ceremony, or bounces to the origin that is allowed to.
 *
 * The same component is both the entry point (login form, account page) and the
 * button on `/auth/passkey`: on the ceremony origin it runs inline, anywhere
 * else it redirects there and comes back. That one rule covers master admins on
 * the apex and local development — both already on the ceremony origin — without
 * a special case. See `lib/passkey/ceremony-url.ts`.
 */
export function PasskeyButton({
  mode,
  returnUrl,
  returnPath,
  variant = "outline",
  className,
  onEnrolled,
}: Props) {
  const t = useTranslations("auth");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // WebAuthn support and the host are only knowable in the browser, and the
  // server render must not disagree with hydration — which is exactly what
  // useSyncExternalStore's server snapshot is for.
  const supported = useSyncExternalStore(
    subscribeToNothing,
    () =>
      browserSupportsPasskeys() &&
      passkeysAvailable(window.location.host, getBaseDomain()),
    () => false,
  );

  if (!supported) return null;

  async function handleClick() {
    setError(null);
    const fallbackPath =
      returnPath ??
      (mode === "enroll" ? window.location.pathname : "/protected");
    const destination = returnUrl ?? `${window.location.origin}${fallbackPath}`;
    const ceremonyOrigin = passkeyCeremonyOrigin(
      window.location.host,
      getBaseDomain(),
    );

    if (ceremonyOrigin) {
      const url = new URL("/auth/passkey", ceremonyOrigin);
      url.searchParams.set("mode", mode);
      url.searchParams.set("next", destination);
      window.location.assign(url.toString());
      return;
    }

    setBusy(true);
    try {
      await runPasskeyCeremony(mode);
      if (mode === "enroll" && onEnrolled) {
        onEnrolled();
        return;
      }
      // replace, not assign: Back should not return to the ceremony and re-run it.
      window.location.replace(destination);
    } catch (err) {
      if (!isPasskeyCancellation(err)) {
        setError(
          err instanceof Error && err.message ? err.message : t("genericError"),
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant={variant}
        className="w-full"
        disabled={busy}
        onClick={handleClick}
      >
        <KeyRound className="mr-2 size-4" aria-hidden="true" />
        {busy
          ? t("passkeyWorking")
          : mode === "signin"
            ? t("passkeySignIn")
            : t("passkeyEnroll")}
      </Button>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  );
}
