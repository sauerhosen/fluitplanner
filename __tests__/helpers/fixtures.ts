import type { Match } from "@/lib/types/domain";

/** DB-defaulted sync columns, for spreading into Match test fixtures. */
export const matchSyncDefaults: Pick<
  Match,
  | "external_id"
  | "source"
  | "cancelled_upstream"
  | "needs_review"
  | "review_reasons"
  | "last_synced_at"
> = {
  external_id: null,
  source: "manual",
  cancelled_upstream: false,
  needs_review: false,
  review_reasons: [],
  last_synced_at: null,
};
