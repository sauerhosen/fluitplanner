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
 * `rateLimitDeadline` (epoch ms) lets the client wait out upstream throttling
 * until then; leave it unset for interactive callers, which must fail fast.
 */
export function createHockeyDeps(
  opts: { rateLimitDeadline?: number } = {},
): HockeyDeps {
  const supabase = createServiceClient();
  return {
    supabase,
    client: createHockeyClient({
      store: createDbCredentialStore(supabase),
      rateLimitDeadline: opts.rateLimitDeadline,
    }),
  };
}
