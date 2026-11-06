import { createServiceClient } from "@/lib/supabase/service";

export type PollClubName =
  { found: true; clubName: string } | { found: false; clubName: null };

/**
 * The club name for a poll's link-preview image, in one query.
 *
 * Deliberately not `getPollMeta`: that loads the whole poll (slots, closed
 * days, featured matches) through the cookie-backed SSR client, which can
 * write refreshed session cookies onto the response. The preview image is
 * publicly cacheable, so it must not carry Set-Cookie. The service client
 * holds no session; the poll token is the public credential here, just as on
 * the poll page itself, and only the club name leaves this function.
 *
 * Throws on a database error so callers can tell a transient failure from a
 * definite miss and avoid caching the fallback image.
 */
export async function getPollClubName(token: string): Promise<PollClubName> {
  const { data, error } = await createServiceClient()
    .from("polls")
    .select("organizations(name, is_active)")
    .eq("token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const org = data?.organizations as unknown as {
    name: string;
    is_active: boolean;
  } | null;
  if (!org?.is_active) return { found: false, clubName: null };
  return { found: true, clubName: org.name };
}
