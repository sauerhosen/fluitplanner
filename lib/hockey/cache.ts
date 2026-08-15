import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read-through cache over hockey_api_cache (service-role only). Serverless-safe:
 * survives function invocations, shared across orgs. On a miss (or stale hit)
 * the fetcher runs and the result is stored under the key.
 */
export async function getCachedJson<T>(
  supabase: SupabaseClient,
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const { data } = await supabase
    .from("hockey_api_cache")
    .select("payload, fetched_at")
    .eq("cache_key", key)
    .maybeSingle();

  if (data && Date.now() - new Date(data.fetched_at).getTime() < ttlMs) {
    return data.payload as T;
  }

  const fresh = await fetcher();
  const { error } = await supabase.from("hockey_api_cache").upsert(
    {
      cache_key: key,
      payload: fresh,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "cache_key" },
  );
  if (error) throw new Error(error.message);
  return fresh;
}
