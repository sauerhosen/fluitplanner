import { describe, it, expect } from "vitest";
import {
  applyConfirmation,
  detectSuspects,
  orderSuspects,
  RECHECK_AFTER_MS,
  type SnapshotRow,
  type StoredMatch,
  type Suspect,
} from "@/lib/club-feed/detect";
import { fingerprintOf, type FeedFixture } from "@/lib/club-feed/parse";

const NOW = new Date("2026-10-25T10:00:00+01:00");
const TEAM = "lisa-team-h9";

const fixture = (overrides: Partial<FeedFixture> = {}): FeedFixture => ({
  code: 2138031,
  lisaTeamId: TEAM,
  date: "2026-10-28",
  time: "20:30",
  field: "Water 1",
  cancelled: false,
  isHome: true,
  venue: "Het Loopveld",
  ...overrides,
});

/** The stored match the fixture above agrees with. */
const stored = (overrides: Partial<StoredMatch> = {}): StoredMatch => ({
  externalId: 2138031,
  date: "2026-10-28",
  startTime: "2026-10-28T20:30:00+01:00",
  field: "Veld 1",
  cancelledUpstream: false,
  homeTeam: "VVV HC H9",
  ...overrides,
});

const snapshotOf = (
  feedFixture: FeedFixture,
  overrides: Partial<SnapshotRow> = {},
): SnapshotRow => ({
  code: feedFixture.code,
  lisaTeamId: feedFixture.lisaTeamId,
  fingerprint: fingerprintOf(feedFixture),
  pendingFingerprint: null,
  checkedAt: null,
  ...overrides,
});

function detect(opts: {
  fixtures: FeedFixture[];
  snapshot?: SnapshotRow[];
  stored?: StoredMatch[];
  mapped?: string[];
  now?: Date;
}) {
  return detectSuspects({
    fixtures: opts.fixtures,
    snapshot: new Map((opts.snapshot ?? []).map((row) => [row.code, row])),
    stored: new Map((opts.stored ?? []).map((row) => [row.externalId, row])),
    mappedTeams: new Set(opts.mapped ?? []),
    now: opts.now ?? NOW,
  });
}

describe("detectSuspects", () => {
  it("writes a feed's first poll as a baseline, raising nothing for agreeing rows", () => {
    const current = fixture();
    const { suspects, snapshot } = detect({
      fixtures: [current],
      stored: [stored()],
      mapped: [TEAM],
    });
    expect(suspects).toEqual([]);
    expect(snapshot).toEqual([snapshotOf(current)]);
  });

  it("raises a changed row on a stored code, and keeps the old fingerprint pending", () => {
    const before = fixture();
    const after = fixture({ time: "21:00" });
    const { suspects, snapshot } = detect({
      fixtures: [after],
      snapshot: [snapshotOf(before)],
      stored: [stored({ startTime: "2026-10-28T21:00:00+01:00" })],
    });
    expect(suspects).toEqual([
      expect.objectContaining({
        code: 2138031,
        rules: ["changed"],
        fingerprint: fingerprintOf(after),
      }),
    ]);
    expect(snapshot[0]).toMatchObject({
      fingerprint: fingerprintOf(before),
      pendingFingerprint: fingerprintOf(after),
    });
  });

  it("keeps raising an unconfirmed change on the next run", () => {
    const before = fixture();
    const after = fixture({ field: "Water 2" });
    const first = detect({
      fixtures: [after],
      snapshot: [snapshotOf(before)],
      stored: [stored()],
    });
    // No confirmation happened: the snapshot is stored as detected
    const second = detect({
      fixtures: [after],
      snapshot: first.snapshot,
      stored: [stored()],
    });
    expect(second.suspects.map((s) => s.rules)).toEqual([["changed"]]);
  });

  it("clears a pending change that LISA reverted", () => {
    const before = fixture();
    const { suspects, snapshot } = detect({
      fixtures: [before],
      snapshot: [
        snapshotOf(before, {
          pendingFingerprint: fingerprintOf(fixture({ time: "21:00" })),
        }),
      ],
      stored: [stored()],
    });
    expect(suspects).toEqual([]);
    expect(snapshot[0].pendingFingerprint).toBeNull();
  });

  it("raises drift when LISA disagrees with the stored date, time or cancellation", () => {
    const cases: Array<[FeedFixture, StoredMatch]> = [
      [fixture({ date: "2026-10-29" }), stored()],
      [fixture({ time: "19:00" }), stored()],
      [fixture({ time: null }), stored()],
      [fixture(), stored({ startTime: null })],
      [fixture({ cancelled: true }), stored()],
    ];
    for (const [current, match] of cases) {
      const { suspects } = detect({
        fixtures: [current],
        snapshot: [snapshotOf(current)],
        stored: [match],
      });
      expect(suspects.map((s) => s.rules)).toEqual([["drift"]]);
    }
  });

  it("compares times as Amsterdam wall clock across DST", () => {
    // 2026-10-25 is the CEST → CET switch; a stored UTC instant must match
    const current = fixture({ date: "2026-10-31", time: "08:30" });
    const { suspects } = detect({
      fixtures: [current],
      snapshot: [snapshotOf(current)],
      stored: [
        stored({ date: "2026-10-31", startTime: "2026-10-31T07:30:00+00:00" }),
      ],
    });
    expect(suspects).toEqual([]);
  });

  it("does not treat an upstream un-cancellation as drift", () => {
    const current = fixture();
    const { suspects } = detect({
      fixtures: [current],
      snapshot: [snapshotOf(current)],
      stored: [stored({ cancelledUpstream: true })],
    });
    expect(suspects).toEqual([]);
  });

  it("raises a new timed fixture of a mapped team", () => {
    const current = fixture();
    const { suspects } = detect({
      fixtures: [current],
      snapshot: [snapshotOf(current)],
      mapped: [TEAM],
    });
    expect(suspects.map((s) => s.rules)).toEqual([["new"]]);
  });

  it("never raises an unmapped team's fixtures it does not store", () => {
    const before = fixture();
    const after = fixture({ time: "21:00" });
    const { suspects, snapshot } = detect({
      fixtures: [after, fixture({ code: 1, time: "12:00" })],
      snapshot: [snapshotOf(before)],
    });
    expect(suspects).toEqual([]);
    // Nothing to confirm: the snapshot advances at once
    expect(snapshot[0]).toMatchObject({
      fingerprint: fingerprintOf(after),
      pendingFingerprint: null,
    });
  });

  it("does not raise an untimed or cancelled fixture as new", () => {
    const { suspects } = detect({
      fixtures: [
        fixture({ code: 1, time: null }),
        fixture({ code: 2, cancelled: true }),
      ],
      mapped: [TEAM],
    });
    expect(suspects).toEqual([]);
  });

  it("raises a pitch fill-in for a stored match without a field", () => {
    const current = fixture();
    const { suspects } = detect({
      fixtures: [current],
      snapshot: [snapshotOf(current)],
      stored: [stored({ field: null })],
    });
    expect(suspects.map((s) => s.rules)).toEqual([["pitch"]]);
  });

  it("collects every rule a row trips", () => {
    const before = fixture();
    const after = fixture({ time: "21:00" });
    const { suspects } = detect({
      fixtures: [after],
      snapshot: [snapshotOf(before)],
      stored: [stored({ field: null })],
    });
    expect(suspects[0].rules).toEqual(["changed", "drift", "pitch"]);
  });

  describe("recheck backoff", () => {
    const current = fixture({ time: "19:00" });
    const recently = new Date(NOW.getTime() - RECHECK_AFTER_MS + 60_000);
    const longAgo = new Date(NOW.getTime() - RECHECK_AFTER_MS - 60_000);

    it("holds back a drift-only suspect checked within 6 hours", () => {
      const { suspects } = detect({
        fixtures: [current],
        snapshot: [snapshotOf(current, { checkedAt: recently.toISOString() })],
        stored: [stored()],
      });
      expect(suspects).toEqual([]);
    });

    it("re-checks it after 6 hours", () => {
      const { suspects } = detect({
        fixtures: [current],
        snapshot: [snapshotOf(current, { checkedAt: longAgo.toISOString() })],
        stored: [stored()],
      });
      expect(suspects).toHaveLength(1);
    });

    it("never holds back a changed row", () => {
      const after = fixture({ time: "18:00" });
      const { suspects } = detect({
        fixtures: [after],
        snapshot: [snapshotOf(current, { checkedAt: recently.toISOString() })],
        stored: [stored()],
      });
      expect(suspects[0].rules).toEqual(["changed", "drift"]);
    });
  });
});

describe("applyConfirmation", () => {
  it("advances the fingerprint and records the check", () => {
    const row = snapshotOf(fixture(), { pendingFingerprint: "new" });
    expect(applyConfirmation(row, "new", NOW.toISOString())).toEqual({
      ...row,
      fingerprint: "new",
      pendingFingerprint: null,
      checkedAt: NOW.toISOString(),
    });
  });
});

describe("orderSuspects", () => {
  const suspect = (overrides: Partial<Suspect>): Suspect => ({
    code: 1,
    rules: ["drift"],
    date: "2026-10-28",
    cancelled: false,
    lisaTeamId: TEAM,
    fingerprint: "f",
    ...overrides,
  });

  it("puts cancellations first, then the soonest match, then rule priority", () => {
    const ordered = orderSuspects([
      suspect({ code: 1, date: "2026-11-01", rules: ["changed"] }),
      suspect({ code: 2, date: "2026-10-26", rules: ["pitch"] }),
      suspect({ code: 3, date: "2026-12-01", cancelled: true }),
      suspect({ code: 4, date: "2026-10-26", rules: ["new", "changed"] }),
      suspect({ code: 5, date: "2026-10-26", rules: ["pitch"] }),
    ]);
    expect(ordered.map((s) => s.code)).toEqual([3, 4, 2, 5, 1]);
  });
});
