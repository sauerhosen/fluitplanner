/**
 * PostgREST helpers for queries that outgrow one request: long `.in()` id
 * lists and result sets past the server's row cap.
 */

function throwDb(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/**
 * PostgREST sends filters in the query string, so a long `.in()` id list
 * blows past URL length limits (~300 uuids is already too many). Run such
 * lookups in batches and concatenate.
 */
const IN_BATCH_SIZE = 100;

export function batches<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += IN_BATCH_SIZE) {
    out.push(items.slice(i, i + IN_BATCH_SIZE));
  }
  return out;
}

export async function selectInBatches<Row>(
  ids: string[],
  query: (batch: string[]) => PromiseLike<{
    data: Row[] | null;
    error: { message: string } | null;
  }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const batch of batches(ids)) {
    const { data, error } = await query(batch);
    throwDb(error);
    rows.push(...(data ?? []));
  }
  return rows;
}

/** Same URL-length rule as selectInBatches, for a delete. */
export async function deleteInBatches(
  ids: string[],
  mutate: (batch: string[]) => PromiseLike<{
    error: { message: string } | null;
  }>,
): Promise<void> {
  for (const batch of batches(ids)) {
    const { error } = await mutate(batch);
    throwDb(error);
  }
}

/**
 * PostgREST also caps how many rows one select returns (db.max_rows, 1000 by
 * default) and truncates silently. Org-wide fetches must page with .range()
 * until a short page arrives; give the query a stable .order() so pages
 * don't overlap.
 */
const PAGE_SIZE = 1000;

export async function selectAllPages<Row>(
  query: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: Row[] | null;
    error: { message: string } | null;
  }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query(from, from + PAGE_SIZE - 1);
    throwDb(error);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
