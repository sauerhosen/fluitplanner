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

  // DST in the EU: 2026-03-29 02:00 CET jumps to 03:00 CEST; 2026-10-25
  // 03:00 CEST falls back to 02:00 CET.
  it("stays on the pre-transition offset just before spring-forward", () => {
    expect(composeAmsterdamTimestamp("2026-03-29", "01:30")).toBe(
      "2026-03-29T01:30:00+01:00",
    );
  });

  it("uses CEST just before fall-back", () => {
    expect(composeAmsterdamTimestamp("2026-10-25", "01:30")).toBe(
      "2026-10-25T01:30:00+02:00",
    );
  });

  it("maps a nonexistent spring-forward wall time with the pre-gap offset", () => {
    // 02:30 does not exist on 2026-03-29; +01:00 lands it at 03:30 CEST.
    expect(getAmsterdamOffset("2026-03-29", "02:30")).toBe("+01:00");
  });

  it("resolves an ambiguous fall-back wall time deterministically", () => {
    // 02:30 occurs twice on 2026-10-25; the helper settles on the later
    // (CET) occurrence.
    expect(getAmsterdamOffset("2026-10-25", "02:30")).toBe("+01:00");
  });

  it("is correct just after both transitions", () => {
    expect(getAmsterdamOffset("2026-03-29", "03:30")).toBe("+02:00");
    expect(getAmsterdamOffset("2026-10-25", "03:30")).toBe("+01:00");
  });
});
