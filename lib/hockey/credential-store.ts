import type { SupabaseClient } from "@supabase/supabase-js";
import type { CredentialStore } from "./types";

/**
 * DB-backed store for the single global Match Center device credential.
 * Must be used with the service-role client — hockey_device_credentials
 * has RLS enabled with no policies.
 */
export function createDbCredentialStore(
  supabase: SupabaseClient,
): CredentialStore {
  return {
    async load() {
      const { data, error } = await supabase
        .from("hockey_device_credentials")
        .select("device_uuid, device_token")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return { uuid: data.device_uuid, token: data.device_token };
    },
    async save(credentials) {
      const { error } = await supabase.from("hockey_device_credentials").upsert(
        {
          id: 1,
          device_uuid: credentials.uuid,
          device_token: credentials.token,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);
    },
  };
}
