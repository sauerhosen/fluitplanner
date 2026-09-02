import type { Match } from "@/lib/types/domain";

/** DB-defaulted columns, for spreading into Match test fixtures. */
export const matchColumnDefaults: Pick<
  Match,
  | "external_id"
  | "source"
  | "cancelled_upstream"
  | "needs_review"
  | "review_reasons"
  | "last_synced_at"
  | "featured_by_default"
> = {
  external_id: null,
  source: "manual",
  cancelled_upstream: false,
  needs_review: false,
  review_reasons: [],
  last_synced_at: null,
  featured_by_default: false,
};
