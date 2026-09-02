import { describe, it, expect } from "vitest";
import {
  FEATURED_MATCH_COLUMNS,
  FEATURED_MATCH_SELECT,
  groupFeaturedBySlot,
  resolveFeaturedMatches,
  resolveFeaturedOnReplace,
  type FeaturedMatchRow,
} from "@/lib/domain/featured-matches";
import type { PollSlot } from "@/lib/types/domain";

const slots: PollSlot[] = [
  {
    id: "slot-morning",
    poll_id: "poll-1",
    start_time: "2026-09-05T09:40:00Z",
    end_time: "2026-09-05T11:40:00Z",
  },
  {
    id: "slot-afternoon",
    poll_id: "poll-1",
    start_time: "2026-09-05T12:25:00Z",
    end_time: "2026-09-05T14:25:00Z",
  },
];

function row(overrides: Partial<FeaturedMatchRow> & { id: string }) {
  return {
    start_time: "2026-09-05T10:00:00Z",
    home_team: "HIC H1",
    away_team: "Bloemendaal H1",
    ...overrides,
  };
}

describe("FEATURED_MATCH_COLUMNS", () => {
  // This list is the only boundary between the `matches` table and an
  // unauthenticated page, because the read bypasses RLS via the service
  // client. A widened select is a data leak, so pin it exactly.
  it("exposes only the four columns the public page needs", () => {
    expect([...FEATURED_MATCH_COLUMNS]).toEqual([
      "id",
      "start_time",
      "home_team",
      "away_team",
    ]);
  });

  it("never selects internal columns or a wildcard", () => {
    expect(FEATURED_MATCH_SELECT).not.toContain("*");
    for (const internal of [
      "notes",
      "required_level",
      "created_by",
      "venue",
      "field",
      "organization_id",
    ]) {
      expect(FEATURED_MATCH_SELECT).not.toContain(internal);
    }
  });
});

describe("resolveFeaturedMatches", () => {
  it("resolves a match to the slot containing its kick-off", () => {
    const result = resolveFeaturedMatches([row({ id: "m1" })], slots);

    expect(result).toEqual([
      {
        matchId: "m1",
        slotId: "slot-morning",
        homeTeam: "HIC H1",
        awayTeam: "Bloemendaal H1",
      },
    ]);
  });

  it("drops a match with no kick-off time", () => {
    const result = resolveFeaturedMatches(
      [row({ id: "m1", start_time: null })],
      slots,
    );

    expect(result).toEqual([]);
  });

  it("drops a match whose kick-off falls in no slot", () => {
    const result = resolveFeaturedMatches(
      [row({ id: "m1", start_time: "2026-09-05T18:00:00Z" })],
      slots,
    );

    expect(result).toEqual([]);
  });

  it("keeps several matches that share one slot", () => {
    const result = resolveFeaturedMatches(
      [
        row({ id: "m1", start_time: "2026-09-05T12:45:00Z" }),
        row({ id: "m2", start_time: "2026-09-05T13:30:00Z" }),
      ],
      slots,
    );

    expect(result.map((m) => m.matchId)).toEqual(["m1", "m2"]);
    expect(result.every((m) => m.slotId === "slot-afternoon")).toBe(true);
  });
});

describe("groupFeaturedBySlot", () => {
  it("groups matches under the slot they appear in", () => {
    const featured = resolveFeaturedMatches(
      [
        row({ id: "m1", start_time: "2026-09-05T10:00:00Z" }),
        row({ id: "m2", start_time: "2026-09-05T12:45:00Z" }),
        row({ id: "m3", start_time: "2026-09-05T13:30:00Z" }),
      ],
      slots,
    );

    const bySlot = groupFeaturedBySlot(featured);

    expect(bySlot.get("slot-morning")?.map((m) => m.matchId)).toEqual(["m1"]);
    expect(bySlot.get("slot-afternoon")?.map((m) => m.matchId)).toEqual([
      "m2",
      "m3",
    ]);
  });

  it("returns an empty map for no featured matches", () => {
    expect(groupFeaturedBySlot([]).size).toBe(0);
  });
});

describe("resolveFeaturedOnReplace", () => {
  it("keeps the per-poll choice for matches already in the poll", () => {
    // The regression this guards: poll_matches is replaced wholesale on any
    // edit to a poll's match list, which would reset every flag.
    const resolved = resolveFeaturedOnReplace(
      ["m1", "m2"],
      [
        { matchId: "m1", featured: true },
        { matchId: "m2", featured: false },
      ],
      new Map([
        ["m1", false],
        ["m2", true],
      ]),
    );

    expect(resolved.get("m1")).toBe(true);
    expect(resolved.get("m2")).toBe(false);
  });

  it("seeds a joining match from its match-level default", () => {
    const resolved = resolveFeaturedOnReplace(
      ["m1", "m2"],
      [{ matchId: "m1", featured: false }],
      new Map([
        ["m1", true],
        ["m2", true],
      ]),
    );

    expect(resolved.get("m1")).toBe(false);
    expect(resolved.get("m2")).toBe(true);
  });

  it("defaults a joining match with no known default to not featured", () => {
    const resolved = resolveFeaturedOnReplace(["m9"], [], new Map());

    expect(resolved.get("m9")).toBe(false);
  });

  it("drops matches leaving the poll", () => {
    const resolved = resolveFeaturedOnReplace(
      ["m1"],
      [
        { matchId: "m1", featured: true },
        { matchId: "m2", featured: true },
      ],
      new Map(),
    );

    expect([...resolved.keys()]).toEqual(["m1"]);
  });
});
