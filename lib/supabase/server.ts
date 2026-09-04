import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { getBaseDomain } from "@/lib/base-domain";
import { authCookieOptions } from "@/lib/supabase/cookie-domain";

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const host = (await headers()).get("host") ?? "";

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Ceremonies only run in the browser, but the account page reads
      // `auth.passkey.list()` server-side, which is behind the same opt-in.
      auth: { experimental: { passkey: true } },
      // Must match the browser and proxy clients exactly — see authCookieOptions.
      cookieOptions: authCookieOptions(host, getBaseDomain()),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have proxy refreshing
            // user sessions.
          }
        },
      },
    },
  );
}
