import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { createHockeyClient } from "./client";
import { createDbCredentialStore } from "./credential-store";
import type { HockeyClient } from "./types";

export type HockeyDeps = {
  supabase: SupabaseClient;
  client: HockeyClient;
};

/**
 * Service-role client plus the signed Match Center client wired to the
 * DB credential store — the one way to construct the sync/discovery deps.
 * `maxRateLimitWaitMs` lets the client wait out upstream throttling; leave it
 * unset for interactive callers, which must fail fast instead.
 */
export function createHockeyDeps(
  opts: { maxRateLimitWaitMs?: number } = {},
): HockeyDeps {
  const supabase = createServiceClient();
  return {
    supabase,
    client: createHockeyClient({
      store: createDbCredentialStore(supabase),
      maxRateLimitWaitMs: opts.maxRateLimitWaitMs,
    }),
  };
}
