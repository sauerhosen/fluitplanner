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
  /** Awaited only after an actual upstream fetch — cache hits never pause. */
  pause?: () => Promise<void>,
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
  // A cache-write failure must not fail the caller — the fetched data is good.
  const { error } = await supabase.from("hockey_api_cache").upsert(
    {
      cache_key: key,
      payload: fresh,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "cache_key" },
  );
  if (error) {
    console.warn(`hockey_api_cache write failed for ${key}: ${error.message}`);
  }
  if (pause) await pause();
  return fresh;
}

/**
 * When each of these keys was last fetched upstream (ms since epoch). Keys
 * never cached are absent. Best-effort: a failed read returns an empty map.
 */
export async function getCachedAt(
  supabase: SupabaseClient,
  keys: string[],
): Promise<Map<string, number>> {
  const fetchedAt = new Map<string, number>();
  if (keys.length === 0) return fetchedAt;
  const { data, error } = await supabase
    .from("hockey_api_cache")
    .select("cache_key, fetched_at")
    .in("cache_key", keys);
  if (error) return fetchedAt;
  for (const row of data ?? []) {
    fetchedAt.set(row.cache_key, new Date(row.fetched_at).getTime());
  }
  return fetchedAt;
}
