import { describe, it, expect } from "vitest";
import {
  collectClubDayFixtures,
  collectImportableFixtures,
} from "@/lib/hockey/import";
import type { ApiMatchSummary } from "@/lib/hockey/types";

const TEAM_ID = 774;
const TODAY = "2026-09-20";

function makeMatch(overrides: Partial<ApiMatchSummary> = {}): ApiMatchSummary {
  return {
    id: 2079156,
    date: "2026-09-27T12:45:00+02:00",
    status: "scheduled",
    home: { id: TEAM_ID, name: "VVV D3" },
    away: { id: 812, name: "AMVJ D3" },
    location: {
      facility: { name: "Sportpark Kees Boekelaan" },
      field: { name: "Veld 2" },
    },
    competition_name: "3e klasse D",
    ...overrides,
  };
}

describe("collectImportableFixtures", () => {
  it("returns the team's future home fixtures, newest last", () => {
    const fixtures = collectImportableFixtures(
      [
        makeMatch({ id: 2, date: "2026-10-04T14:00:00+02:00" }),
        makeMatch({ id: 1, date: "2026-09-27T12:45:00+02:00" }),
      ],
      TEAM_ID,
      TODAY,
    );

    expect(fixtures.map((f) => f.matchId)).toEqual([1, 2]);
    expect(fixtures[0]).toMatchObject({
      date: "2026-09-27",
      start: "2026-09-27T12:45:00+02:00",
      homeTeam: "VVV D3",
      awayTeam: "AMVJ D3",
      venue: "Sportpark Kees Boekelaan",
      field: "Veld 2",
      competition: "3e klasse D",
      timeConfirmed: true,
    });
  });

  it("drops away fixtures — the home club staffs the umpires", () => {
    const fixtures = collectImportableFixtures(
      [
        makeMatch({
          home: { id: 812, name: "AMVJ D3" },
          away: { id: TEAM_ID, name: "VVV D3" },
        }),
      ],
      TEAM_ID,
      TODAY,
    );

    expect(fixtures).toEqual([]);
  });

  it("drops played, live and unusable fixtures", () => {
    for (const status of ["final", "result", "live", "expired", "unknown"]) {
      const fixtures = collectImportableFixtures(
        [makeMatch({ status })],
        TEAM_ID,
        TODAY,
      );
      expect(fixtures, status).toEqual([]);
    }
  });

  it("drops cancelled fixtures — there is nothing to staff", () => {
    for (const status of ["cancelled", "discontinued"]) {
      const fixtures = collectImportableFixtures(
        [makeMatch({ status })],
        TEAM_ID,
        TODAY,
      );
      expect(fixtures, status).toEqual([]);
    }
  });

  it("drops fixtures before today but keeps today's", () => {
    const fixtures = collectImportableFixtures(
      [
        makeMatch({ id: 1, date: "2026-09-19T12:45:00+02:00" }),
        makeMatch({ id: 2, date: "2026-09-20T12:45:00+02:00" }),
      ],
      TEAM_ID,
      TODAY,
    );

    expect(fixtures.map((f) => f.matchId)).toEqual([2]);
  });

  it("keeps fixtures still awaiting a kick-off time, with no start", () => {
    const fixtures = collectImportableFixtures(
      [makeMatch({ status: "announced", date: "2026-09-27T00:00:00+02:00" })],
      TEAM_ID,
      TODAY,
    );

    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]).toMatchObject({
      date: "2026-09-27",
      start: null,
      timeConfirmed: false,
    });
  });

  it("skips fixtures with an unparseable upstream date", () => {
    const fixtures = collectImportableFixtures(
      [makeMatch({ date: "not a date" })],
      TEAM_ID,
      TODAY,
    );

    expect(fixtures).toEqual([]);
  });
});

describe("collectClubDayFixtures", () => {
  const CLUB = "HH11AS0";
  const DAY = "2026-10-24";

  const home = (id: number, club: string | null = CLUB) => ({
    id,
    name: `Team ${id}`,
    hockey_type: "VE",
    federation_reference_id: club,
  });

  it("keeps the club's home matches on that day, soonest first", () => {
    const fixtures = collectClubDayFixtures(
      [
        makeMatch({ id: 2, home: home(1), date: "2026-10-24T10:15:00+02:00" }),
        makeMatch({ id: 1, home: home(2), date: "2026-10-24T08:30:00+02:00" }),
        makeMatch({ id: 3, home: home(3), date: "2026-10-25T08:30:00+02:00" }),
      ],
      CLUB,
      DAY,
    );

    expect(fixtures.map((f) => f.matchId)).toEqual([1, 2]);
  });

  it("drops other clubs' matches at a shared venue", () => {
    const fixtures = collectClubDayFixtures(
      [makeMatch({ id: 1, home: home(1, "HH11RD6") })],
      CLUB,
      DAY,
    );

    expect(fixtures).toEqual([]);
  });

  it("drops the club's away matches and indoor teams", () => {
    const fixtures = collectClubDayFixtures(
      [
        makeMatch({ id: 1, home: home(9, "HH11RD6"), away: home(1) }),
        makeMatch({ id: 2, home: { ...home(2), hockey_type: "ZA" } }),
      ],
      CLUB,
      DAY,
    );

    expect(fixtures).toEqual([]);
  });

  it("drops cancelled matches", () => {
    const fixtures = collectClubDayFixtures(
      [makeMatch({ id: 1, home: home(1), status: "cancelled" })],
      CLUB,
      DAY,
    );

    expect(fixtures).toEqual([]);
  });

  it("tells the day apart in Europe/Amsterdam, not UTC", () => {
    // 00:30 on the 25th in Amsterdam is still the 24th in UTC.
    const fixtures = collectClubDayFixtures(
      [makeMatch({ id: 1, home: home(1), date: "2026-10-25T00:30:00+02:00" })],
      CLUB,
      DAY,
    );

    expect(fixtures).toEqual([]);
  });
});
