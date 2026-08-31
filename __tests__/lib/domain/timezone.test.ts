import { describe, it, expect } from "vitest";
import {
  composeAmsterdamTimestamp,
  getAmsterdamOffset,
} from "@/lib/domain/timezone";

describe("composeAmsterdamTimestamp", () => {
  it("uses CEST (+02:00) in summer", () => {
    const iso = composeAmsterdamTimestamp("2026-09-05", "08:30");
    expect(iso).toBe("2026-09-05T08:30:00+02:00");
    expect(new Date(iso).toISOString()).toBe("2026-09-05T06:30:00.000Z");
  });

  it("uses CET (+01:00) in winter", () => {
    const iso = composeAmsterdamTimestamp("2026-12-12", "10:00");
    expect(iso).toBe("2026-12-12T10:00:00+01:00");
    expect(new Date(iso).toISOString()).toBe("2026-12-12T09:00:00.000Z");
  });

  it("offset helper returns well-formed offsets", () => {
    expect(getAmsterdamOffset("2026-07-01", "12:00")).toBe("+02:00");
    expect(getAmsterdamOffset("2026-01-15", "12:00")).toBe("+01:00");
  });
});
