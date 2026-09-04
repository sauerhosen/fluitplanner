import { createBrowserClient } from "@supabase/ssr";
import { getBaseDomain } from "@/lib/base-domain";
import { authCookieOptions } from "@/lib/supabase/cookie-domain";

/**
 * Browser Supabase client.
 *
 * `createBrowserClient` memoises a singleton, so the options given on the first
 * call in a page's lifetime are the ones that stick. Both settings below have to
 * live here — passing them to a bespoke `createBrowserClient` call elsewhere
 * would be silently ignored.
 */
export function createClient() {
  // Client components are pre-rendered on the server, where there is no window.
  // The SSR pass has no cookies to write, so a host-only scope is correct there.
  const host = typeof window === "undefined" ? "" : window.location.host;

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Passkeys are behind an experimental opt-in in @supabase/auth-js; without
      // it every passkey method throws at call time.
      auth: { experimental: { passkey: true } },
      cookieOptions: authCookieOptions(host, getBaseDomain()),
    },
  );
}
