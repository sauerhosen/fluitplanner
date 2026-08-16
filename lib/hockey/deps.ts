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
 */
export function createHockeyDeps(): HockeyDeps {
  const supabase = createServiceClient();
  return {
    supabase,
    client: createHockeyClient({ store: createDbCredentialStore(supabase) }),
  };
}
