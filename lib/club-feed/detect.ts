import { composeAmsterdamTimestamp } from "@/lib/domain/timezone";
import { sameInstant } from "@/lib/hockey/normalize";
import { fingerprintOf, type FeedFixture } from "./parse";

// Pure change detection over one polled feed. LISA only ever decides which
// matches to ask the Match Center about — nothing here is written to matches.

/** Why a fixture is worth one Match Center request, in priority order. */
export const SUSPECT_RULES = ["changed", "drift", "new", "pitch"] as const;
export type SuspectRule = (typeof SUSPECT_RULES)[number];

/**
 * How often a suspect raised only by comparison with our data (drift, new,
 * pitch fill-in) is re-checked while its LISA row stays the same — a lasting
 * disagreement between LISA and the Match Center must not burn the budget on
 * every run. A changed row is never held back.
 */
export const RECHECK_AFTER_MS = 6 * 60 * 60 * 1000;

/** Last seen state of one fixture in a feed (club_feed_fixtures). */
export type SnapshotRow = {
  code: number;
  lisaTeamId: string;
  /** Advanced only once the Match Center has been asked about the match. */
  fingerprint: string;
  /** Seen in LISA but not yet confirmed. */
  pendingFingerprint: string | null;
  checkedAt: string | null;
};

/** The stored match a code points at (matches.external_id). */
export type StoredMatch = {
  externalId: number;
  date: string;
  startTime: string | null;
  field: string | null;
  cancelledUpstream: boolean;
  homeTeam: string;
};

export type Suspect = {
  code: number;
  rules: SuspectRule[];
  date: string;
  cancelled: boolean;
  lisaTeamId: string;
  /** The row's current fingerprint, stored once the suspect is confirmed. */
  fingerprint: string;
};

export type Detection = {
  suspects: Suspect[];
  /** The snapshot to store for every watched fixture of the feed. */
  snapshot: SnapshotRow[];
};

/** Whether LISA's date, time or cancellation disagrees with the stored row. */
function drifts(fixture: FeedFixture, stored: StoredMatch): boolean {
  if (fixture.cancelled && !stored.cancelledUpstream) return true;
  if (fixture.date !== stored.date) return true;
  const lisaStart = fixture.time
    ? composeAmsterdamTimestamp(fixture.date, fixture.time)
    : null;
  return !sameInstant(lisaStart, stored.startTime);
}

export function detectSuspects(input: {
  fixtures: FeedFixture[];
  snapshot: Map<number, SnapshotRow>;
  stored: Map<number, StoredMatch>;
  /** LISA team ids mapped to one of the org's tracked teams. */
  mappedTeams: Set<string>;
  now: Date;
}): Detection {
  const { fixtures, snapshot, stored, mappedTeams, now } = input;
  const suspects: Suspect[] = [];
  const next: SnapshotRow[] = [];

  for (const fixture of fixtures) {
    const fingerprint = fingerprintOf(fixture);
    const previous = snapshot.get(fixture.code);
    const match = stored.get(fixture.code);
    // Only codes we store, or fixtures of a team we track, may cost a
    // request: a club with ~100 teams and 9 tracked must not spend the
    // budget on the other 91.
    const relevant = match !== undefined || mappedTeams.has(fixture.lisaTeamId);

    // A row seen for the first time (including a feed's first poll) is a
    // baseline, not a change — otherwise adding a feed queues the season.
    const changed =
      previous !== undefined && previous.fingerprint !== fingerprint;
    const rules: SuspectRule[] = [];
    if (relevant && changed) rules.push("changed");
    if (match && drifts(fixture, match)) rules.push("drift");
    if (
      !match &&
      mappedTeams.has(fixture.lisaTeamId) &&
      fixture.time !== null &&
      !fixture.cancelled
    ) {
      rules.push("new");
    }
    if (match && match.field === null && fixture.field !== null) {
      rules.push("pitch");
    }

    const recentlyChecked =
      previous?.checkedAt != null &&
      now.getTime() - new Date(previous.checkedAt).getTime() < RECHECK_AFTER_MS;
    const held =
      rules.length > 0 && !rules.includes("changed") && recentlyChecked;

    if (rules.length > 0 && !held) {
      suspects.push({
        code: fixture.code,
        rules,
        date: fixture.date,
        cancelled: fixture.cancelled,
        lisaTeamId: fixture.lisaTeamId,
        fingerprint,
      });
    }

    // The snapshot only advances past a change once the Match Center has
    // been asked (see applyConfirmation); an irrelevant change has nothing
    // to confirm and advances at once.
    next.push({
      code: fixture.code,
      lisaTeamId: fixture.lisaTeamId,
      fingerprint:
        previous === undefined || !relevant
          ? fingerprint
          : previous.fingerprint,
      pendingFingerprint:
        previous !== undefined && relevant && changed ? fingerprint : null,
      checkedAt: previous?.checkedAt ?? null,
    });
  }

  return { suspects, snapshot: next };
}

/** The snapshot row once its match has been confirmed (whatever the answer). */
export function applyConfirmation(
  row: SnapshotRow,
  fingerprint: string,
  checkedAt: string,
): SnapshotRow {
  return { ...row, fingerprint, pendingFingerprint: null, checkedAt };
}

function ruleRank(suspect: Suspect): number {
  return Math.min(...suspect.rules.map((rule) => SUSPECT_RULES.indexOf(rule)));
}

/**
 * The order suspects spend the budget in: cancellations, then the soonest
 * match, then rule priority; ties by code, so runs are deterministic.
 */
export function orderSuspects(suspects: Suspect[]): Suspect[] {
  return [...suspects].sort(
    (a, b) =>
      Number(b.cancelled) - Number(a.cancelled) ||
      a.date.localeCompare(b.date) ||
      ruleRank(a) - ruleRank(b) ||
      a.code - b.code,
  );
}
