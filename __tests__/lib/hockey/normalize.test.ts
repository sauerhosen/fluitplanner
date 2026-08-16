import { describe, it, expect } from "vitest";
import {
  isTimeConfirmed,
  normalizeMatch,
  fixtureToMatchRow,
} from "@/lib/hockey/normalize";
import type { ApiMatchSummary } from "@/lib/hockey/types";

function makeMatch(overrides: Partial<ApiMatchSummary> = {}): ApiMatchSummary {
  return {
    id: 2079156,
    date: "2026-09-27T12:45:00+02:00",
    status: "scheduled",
    home: { id: 774, name: "VVV D1" },
    away: { id: 812, name: "AMVJ D1" },
    location: {
      facility: { name: "Sportpark Kees Boekelaan" },
      field: { name: "Veld 2" },
    },
    poule_id: 180863,
    poule_name: "Poule A",
    competition_name: "Hoofdklasse Dames",
    remarks: null,
    round: 3,
    ...overrides,
  };
}

describe("isTimeConfirmed", () => {
  it("treats announced matches at local midnight as time TBD", () => {
    const m = makeMatch({
      status: "announced",
      date: "2026-09-27T00:00:00+02:00",
    });
    expect(isTimeConfirmed(m)).toBe(false);
  });

  it("treats announced matches with a real time as confirmed", () => {
    const m = makeMatch({
      status: "announced",
      date: "2026-09-27T14:00:00+02:00",
    });
    expect(isTimeConfirmed(m)).toBe(true);
  });

  it("treats scheduled matches at midnight as confirmed (only announced means TBD)", () => {
    const m = makeMatch({
      status: "scheduled",
      date: "2026-09-27T00:00:00+02:00",
    });
    expect(isTimeConfirmed(m)).toBe(true);
  });

  it("treats an announced match with an unparseable date as TBD", () => {
    const m = makeMatch({ status: "announced", date: "2026-09-27" });
    expect(isTimeConfirmed(m)).toBe(false);
  });
});

describe("normalizeMatch", () => {
  it("maps the API record onto the normalized fixture", () => {
    const f = normalizeMatch(makeMatch());
    expect(f).toEqual({
      matchId: 2079156,
      start: "2026-09-27T12:45:00+02:00",
      timeConfirmed: true,
      status: "scheduled",
      homeTeamName: "VVV D1",
      awayTeamName: "AMVJ D1",
      competition: "Hoofdklasse Dames",
      venue: "Sportpark Kees Boekelaan",
      field: "Veld 2",
    });
  });

  it("tolerates missing location and nullable fields", () => {
    const f = normalizeMatch(
      makeMatch({
        location: null,
        competition_name: null,
        poule_id: null,
      }),
    );
    expect(f.venue).toBeNull();
    expect(f.field).toBeNull();
    expect(f.competition).toBeNull();
  });
});

describe("fixtureToMatchRow", () => {
  it("derives the Amsterdam calendar date and keeps the offset timestamp as-is", () => {
    const row = fixtureToMatchRow(normalizeMatch(makeMatch()), 2);
    expect(row).toEqual({
      date: "2026-09-27",
      start_time: "2026-09-27T12:45:00+02:00",
      home_team: "VVV D1",
      away_team: "AMVJ D1",
      venue: "Sportpark Kees Boekelaan",
      field: "Veld 2",
      competition: "Hoofdklasse Dames",
      required_level: 2,
      external_id: 2079156,
    });
  });

  it("derives the Amsterdam date for UTC-offset timestamps crossing midnight", () => {
    // 22:30 UTC on the 27th is 00:30 on the 28th in Europe/Amsterdam (CEST)
    const row = fixtureToMatchRow(
      normalizeMatch(makeMatch({ date: "2026-09-27T22:30:00+00:00" })),
      1,
    );
    expect(row.date).toBe("2026-09-28");
  });

  it("derives the Amsterdam date correctly in winter time (CET)", () => {
    // 23:30 UTC on Jan 10 is 00:30 on Jan 11 in Europe/Amsterdam (CET, +01:00)
    const row = fixtureToMatchRow(
      normalizeMatch(makeMatch({ date: "2027-01-10T23:30:00+00:00" })),
      1,
    );
    expect(row.date).toBe("2027-01-11");
  });
});
