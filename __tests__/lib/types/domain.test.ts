import { describe, it, expect } from "vitest";
import { isAvailabilityLockMode } from "@/lib/types/domain";

describe("isAvailabilityLockMode", () => {
  it('returns true for "warn"', () => {
    expect(isAvailabilityLockMode("warn")).toBe(true);
  });

  it('returns true for "lock"', () => {
    expect(isAvailabilityLockMode("lock")).toBe(true);
  });

  it("returns false for invalid strings", () => {
    expect(isAvailabilityLockMode("block")).toBe(false);
    expect(isAvailabilityLockMode("")).toBe(false);
    expect(isAvailabilityLockMode("WARN")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect(isAvailabilityLockMode(null)).toBe(false);
    expect(isAvailabilityLockMode(undefined)).toBe(false);
    expect(isAvailabilityLockMode(42)).toBe(false);
    expect(isAvailabilityLockMode(true)).toBe(false);
  });
});
