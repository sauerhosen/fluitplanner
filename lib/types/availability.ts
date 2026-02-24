export const AVAILABILITY_GUARD_POLICIES = ["warn", "block"] as const;

export type AvailabilityGuardPolicy =
  (typeof AVAILABILITY_GUARD_POLICIES)[number];
