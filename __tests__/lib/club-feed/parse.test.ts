import { describe, it, expect } from "vitest";
import {
  fingerprintOf,
  parseFeedPages,
  parseFeedRow,
  parseIndexCollections,
  totalPagesOf,
  watchedFixtures,
  type FeedFixture,
} from "@/lib/club-feed/parse";
import vvvIndex from "./fixtures/vvv-index.json";
import amvjIndex from "./fixtures/amvj-index.json";
import myraIndex from "./fixtures/myra-index.json";
import vvvOctober from "./fixtures/vvv-matches_oct_2026.json";
import amvjOctober from "./fixtures/amvj-matches_oct_2026.json";

// Fixtures are captured from three LISA feeds on 2026-10-25, with every key
// but the ones the parser reads stripped (no names, logos, referees).

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "row-1",
  code: "2138031",
  date: "28-10-2026",
  time: "20:30",
  field: "Water 1",
  team_id: "266625e8-751a-4b8b-80e9-13c9c01b6074",
  is_home_match: true,
  is_cancelled: false,
  location: { name: "Sportcomplex 'Het Loopveld' - VVV HC" },
  ...overrides,
});

describe("parseIndexCollections", () => {
  it("lists each month collection once, from all three feeds", () => {
    for (const index of [vvvIndex, amvjIndex, myraIndex]) {
      expect(parseIndexCollections(index)).toEqual([
        "matches_oct_2026",
        "matches_nov_2026",
        "matches_mar_2027",
        "matches_apr_2027",
        "matches_may_2027",
        "matches_jun_2027",
      ]);
    }
  });

  it("drops names that are not plain identifiers — they end up in a path", () => {
    const page = {
      values: [
        { data: { collectionname: "../admin" } },
        { data: { collectionname: "matches_oct_2026?x=1" } },
        { data: { collectionname: 42 } },
        { data: { collectionname: "matches_nov_2026" } },
      ],
    };
    expect(parseIndexCollections(page)).toEqual(["matches_nov_2026"]);
  });

  it("tolerates a malformed page", () => {
    expect(parseIndexCollections(null)).toEqual([]);
    expect(parseIndexCollections({ values: "nope" })).toEqual([]);
    expect(parseIndexCollections({ values: [null, { data: null }] })).toEqual(
      [],
    );
  });
});

describe("totalPagesOf", () => {
  it("reads the page count, at least one", () => {
    expect(totalPagesOf({ page: { totalPages: 3 } })).toBe(3);
    expect(totalPagesOf({ page: { totalPages: 0 } })).toBe(1);
    expect(totalPagesOf({ page: null })).toBe(1);
    expect(totalPagesOf({ page: { totalPages: "lots" } })).toBe(1);
  });
});

describe("parseFeedRow", () => {
  it("parses a timed home fixture", () => {
    expect(parseFeedRow(row())).toEqual({
      code: 2138031,
      lisaTeamId: "266625e8-751a-4b8b-80e9-13c9c01b6074",
      date: "2026-10-28",
      time: "20:30",
      field: "Water 1",
      cancelled: false,
      isHome: true,
      venue: "Sportcomplex 'Het Loopveld' - VVV HC",
    });
  });

  it("reads an untimed fixture and an empty-string pitch as null", () => {
    const fixture = parseFeedRow(row({ time: null, field: "" }));
    expect(fixture?.time).toBeNull();
    expect(fixture?.field).toBeNull();
    expect(parseFeedRow(row({ field: "  " }))?.field).toBeNull();
  });

  it("ignores rows without a numeric code (trainings, Mini's, friendlies)", () => {
    expect(parseFeedRow(row({ code: null }))).toBeNull();
    expect(parseFeedRow(row({ code: "" }))).toBeNull();
    expect(parseFeedRow(row({ code: "ABC123" }))).toBeNull();
  });

  it("ignores rows it cannot date or attribute to a team", () => {
    expect(parseFeedRow(row({ date: "2026-10-28" }))).toBeNull();
    expect(parseFeedRow(row({ date: "31-02-2026" }))).toBeNull();
    expect(parseFeedRow(row({ team_id: "" }))).toBeNull();
  });

  it("drops a malformed time rather than guessing", () => {
    expect(parseFeedRow(row({ time: "25:00" }))?.time).toBeNull();
    expect(parseFeedRow(row({ time: "8:30" }))?.time).toBeNull();
  });

  it("reads only literal booleans as cancelled / home", () => {
    const fixture = parseFeedRow(
      row({ is_cancelled: "true", is_home_match: 1 }),
    );
    expect(fixture?.cancelled).toBe(false);
    expect(fixture?.isHome).toBe(false);
  });
});

describe("parseFeedPages", () => {
  it("keeps coded rows of the captured VVV page, home and away", () => {
    const fixtures = parseFeedPages([
      { collection: "matches_oct_2026", page: vvvOctober },
    ]);
    // 9 rows captured, 2 of them without a code
    expect(fixtures).toHaveLength(7);
    expect(fixtures.filter((fixture) => fixture.isHome)).toHaveLength(5);
  });

  it("reads the AMVJ cancellation", () => {
    const fixtures = parseFeedPages([
      { collection: "matches_oct_2026", page: amvjOctober },
    ]);
    expect(fixtures.find((fixture) => fixture.code === 2116609)).toMatchObject({
      cancelled: true,
      isHome: false,
      date: "2026-10-24",
    });
    // The catch-all team id carries no code and is dropped
    expect(
      fixtures.some(
        (fixture) =>
          fixture.lisaTeamId === "00000000-0000-0000-0000-000000000000",
      ),
    ).toBe(false);
  });

  it("prefers the copy from the collection named for the row's month", () => {
    const stale = row({ date: "31-10-2026", time: "10:00" });
    const own = row({ date: "31-10-2026", time: "11:00" });
    const pages = [
      { collection: "matches_nov_2026", page: { values: [{ data: stale }] } },
      { collection: "matches_oct_2026", page: { values: [{ data: own }] } },
    ];
    expect(parseFeedPages(pages)[0].time).toBe("11:00");
    expect(parseFeedPages([...pages].reverse())[0].time).toBe("11:00");
  });
});

describe("watchedFixtures", () => {
  const base = parseFeedRow(row()) as FeedFixture;

  it("keeps home fixtures from today on", () => {
    const fixtures = [
      { ...base, code: 1, date: "2026-10-25" },
      { ...base, code: 2, date: "2026-10-24" },
      { ...base, code: 3, date: "2026-10-26", isHome: false },
    ];
    expect(watchedFixtures(fixtures, "2026-10-25").map((f) => f.code)).toEqual([
      1,
    ]);
  });

  it("keeps past home cancellations", () => {
    const fixtures = [{ ...base, date: "2026-10-20", cancelled: true }];
    expect(watchedFixtures(fixtures, "2026-10-25")).toHaveLength(1);
  });
});

describe("fingerprintOf", () => {
  const base = parseFeedRow(row()) as FeedFixture;

  it("is stable for the same schedule", () => {
    expect(fingerprintOf(base)).toBe(fingerprintOf({ ...base }));
  });

  it.each([
    ["date", { date: "2026-10-29" }],
    ["time", { time: "21:00" }],
    ["pitch", { field: "Water 2" }],
    ["cancellation", { cancelled: true }],
    ["venue", { venue: "Elsewhere" }],
  ])("changes with the %s", (_, change) => {
    expect(fingerprintOf({ ...base, ...change })).not.toBe(fingerprintOf(base));
  });

  it("ignores what the detector does not compare", () => {
    expect(fingerprintOf({ ...base, lisaTeamId: "other", isHome: false })).toBe(
      fingerprintOf(base),
    );
  });
});
