import { describe, it, expect } from "vitest";
import {
  amsterdamDay,
  isValidDay,
  withoutClosedDays,
} from "@/lib/domain/closed-days";

describe("amsterdamDay", () => {
  it("returns the Amsterdam calendar date, not the UTC one", () => {
    // 23:30 UTC on 5 Sep is already 6 Sep in Amsterdam (CEST, +02:00).
    expect(amsterdamDay("2026-09-05T23:30:00Z")).toBe("2026-09-06");
    expect(amsterdamDay("2026-09-05T08:00:00Z")).toBe("2026-09-05");
  });

  it("handles winter time", () => {
    // 23:30 UTC on 12 Dec is 00:30 on 13 Dec in Amsterdam (CET, +01:00).
    expect(amsterdamDay("2026-12-12T23:30:00Z")).toBe("2026-12-13");
    expect(amsterdamDay("2026-12-12T22:30:00Z")).toBe("2026-12-12");
  });
});

describe("isValidDay", () => {
  it("accepts an ISO calendar date", () => {
    expect(isValidDay("2026-09-05")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidDay("2026-9-5")).toBe(false);
    expect(isValidDay("2026-02-30")).toBe(false);
    expect(isValidDay("2026-09-05T00:00:00Z")).toBe(false);
    expect(isValidDay("")).toBe(false);
  });
});

describe("withoutClosedDays", () => {
  const slots = [
    { id: "sat-1", start_time: "2026-09-05T08:00:00Z" },
    { id: "sat-2", start_time: "2026-09-05T12:00:00Z" },
    { id: "sun-1", start_time: "2026-09-06T09:00:00Z" },
  ];

  it("returns every slot when no day is closed", () => {
    expect(withoutClosedDays(slots, [])).toBe(slots);
  });

  it("drops the slots of a closed day", () => {
    expect(withoutClosedDays(slots, ["2026-09-05"]).map((s) => s.id)).toEqual([
      "sun-1",
    ]);
  });

  it("judges a slot by its Amsterdam date", () => {
    const late = [{ id: "late", start_time: "2026-09-05T22:30:00Z" }];
    // 00:30 on 6 Sep in Amsterdam: closing the 5th leaves it open.
    expect(withoutClosedDays(late, ["2026-09-05"])).toHaveLength(1);
    expect(withoutClosedDays(late, ["2026-09-06"])).toHaveLength(0);
  });
});
