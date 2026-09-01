import { calculateSlot } from "@/lib/domain/slots";
import type {
  Assignment,
  AssignmentStatus,
  Match,
  RosteredUmpire,
} from "@/lib/types/domain";

/**
 * Pure planning logic behind the MCP candidate-search and conflict-check
 * tools. Everything here is deliberately free of I/O so the hard constraints
 * (availability, level, clashes) are unit-testable — the MCP data layer only
 * gathers rows and delegates the judgement to these functions.
 */

export type AvailabilityAnswer = "yes" | "if_need_be" | "no" | "no_response";

export type UmpireWorkload = {
  confirmed: number;
  tentative: number;
  upcoming_confirmed: number;
  last_confirmed_date: string | null;
};

export const EMPTY_WORKLOAD: UmpireWorkload = {
  confirmed: 0,
  tentative: 0,
  upcoming_confirmed: 0,
  last_confirmed_date: null,
};

export type CandidateConflict = {
  match_id: string;
  kind: "overlapping_slot" | "same_day";
  status: AssignmentStatus;
};

export type CandidateAssessment = {
  umpire_id: string;
  name: string;
  level: 1 | 2 | 3;
  availability: AvailabilityAnswer;
  meets_level: boolean;
  already_assigned_to_match: boolean;
  conflicts: CandidateConflict[];
  notes: string | null;
  workload: UmpireWorkload;
};

function slotsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Assess every rostered umpire as a candidate for one match, against the hard
 * constraints: slot availability, qualification level, and clashes with their
 * other assignments (tentative or confirmed, in any poll).
 *
 * Returns all roster members — including unavailable ones — so the caller can
 * explain *why* someone is excluded, sorted best candidate first.
 */
export function assessCandidates(args: {
  match: Match;
  roster: RosteredUmpire[];
  /** Response per umpire for the poll slot containing the match. */
  slotResponses: Map<string, "yes" | "if_need_be" | "no">;
  /** Every assignment in the organization, used for clash detection. */
  assignments: Assignment[];
  /** Matches referenced by those assignments. */
  matchesById: Map<string, Match>;
  workloadByUmpire: Map<string, UmpireWorkload>;
}): CandidateAssessment[] {
  const { match, roster, slotResponses, assignments, matchesById } = args;

  const matchSlot = match.start_time
    ? calculateSlot(new Date(match.start_time))
    : null;

  const assignmentsByUmpire = new Map<string, Assignment[]>();
  for (const a of assignments) {
    const list = assignmentsByUmpire.get(a.umpire_id) ?? [];
    list.push(a);
    assignmentsByUmpire.set(a.umpire_id, list);
  }

  const results = roster.map((umpire): CandidateAssessment => {
    const own = assignmentsByUmpire.get(umpire.id) ?? [];
    const conflicts: CandidateConflict[] = [];
    let alreadyAssigned = false;

    for (const a of own) {
      if (a.match_id === match.id) {
        alreadyAssigned = true;
        continue;
      }
      const other = matchesById.get(a.match_id);
      if (!other) continue;
      if (matchSlot && other.start_time) {
        const otherSlot = calculateSlot(new Date(other.start_time));
        if (slotsOverlap(matchSlot, otherSlot)) {
          conflicts.push({
            match_id: a.match_id,
            kind: "overlapping_slot",
            status: a.status,
          });
          continue;
        }
      }
      if (other.date === match.date) {
        conflicts.push({
          match_id: a.match_id,
          kind: "same_day",
          status: a.status,
        });
      }
    }

    return {
      umpire_id: umpire.id,
      name: umpire.name,
      level: umpire.level,
      availability: slotResponses.get(umpire.id) ?? "no_response",
      meets_level: umpire.level >= match.required_level,
      already_assigned_to_match: alreadyAssigned,
      conflicts,
      notes: umpire.notes,
      workload: args.workloadByUmpire.get(umpire.id) ?? EMPTY_WORKLOAD,
    };
  });

  const availabilityRank: Record<AvailabilityAnswer, number> = {
    yes: 0,
    if_need_be: 1,
    no_response: 2,
    no: 3,
  };

  results.sort((a, b) => {
    // An overlapping booking rules a candidate out regardless of what they
    // answered, so it outranks availability — keeping this list's "best
    // first" consistent with summarizeGap's "ready" bucket.
    const hardA = a.conflicts.some((c) => c.kind === "overlapping_slot");
    const hardB = b.conflicts.some((c) => c.kind === "overlapping_slot");
    return (
      Number(hardA) - Number(hardB) ||
      availabilityRank[a.availability] - availabilityRank[b.availability] ||
      Number(b.meets_level) - Number(a.meets_level) ||
      a.workload.confirmed - b.workload.confirmed ||
      a.name.localeCompare(b.name)
    );
  });

  return results;
}

export type ProposedAssignment = { match_id: string; umpire_id: string };

export type AssignmentIssueCode =
  | "match_not_in_poll"
  | "umpire_not_in_roster"
  | "duplicate_in_proposal"
  | "already_assigned"
  | "overfilled_match"
  | "level_mismatch"
  | "declined_slot"
  | "no_response"
  | "double_booking"
  | "same_day";

export type AssignmentIssue = {
  severity: "error" | "warning";
  code: AssignmentIssueCode;
  match_id?: string;
  umpire_id?: string;
  /** For clash issues: the other match in the pair. */
  conflicting_match_id?: string;
  detail: string;
};

export function availabilityKey(matchId: string, umpireId: string): string {
  return `${matchId}|${umpireId}`;
}

/**
 * Validate an assignment set for one poll: the poll's existing assignments
 * plus an optional proposal (checked as if written tentatively). With an
 * empty proposal this audits the current state.
 *
 * Errors are structural (unknown match/umpire, duplicate, hard double
 * booking); warnings are things a planner may knowingly overrule (level
 * mismatch, assigned despite "no", same-day pairing, third umpire).
 */
export function checkAssignmentSet(args: {
  pollId: string;
  pollMatchIds: Set<string>;
  rosterById: Map<string, RosteredUmpire>;
  matchesById: Map<string, Match>;
  /** Every assignment in the organization (all polls, both statuses). */
  existingAssignments: Assignment[];
  proposed: ProposedAssignment[];
  /** Answer per availabilityKey(match, umpire); absent = match has no slot. */
  availabilityByMatchUmpire: Map<string, AvailabilityAnswer>;
}): AssignmentIssue[] {
  const {
    pollId,
    pollMatchIds,
    rosterById,
    matchesById,
    existingAssignments,
    proposed,
    availabilityByMatchUmpire,
  } = args;
  const issues: AssignmentIssue[] = [];

  const existingTriples = new Set(
    existingAssignments
      .filter((a) => a.poll_id === pollId)
      .map((a) => `${a.match_id}|${a.umpire_id}`),
  );

  // Structural validity of the proposal itself.
  const seen = new Set<string>();
  const accepted: ProposedAssignment[] = [];
  for (const p of proposed) {
    const key = `${p.match_id}|${p.umpire_id}`;
    if (seen.has(key)) {
      issues.push({
        severity: "error",
        code: "duplicate_in_proposal",
        match_id: p.match_id,
        umpire_id: p.umpire_id,
        detail:
          "This match/umpire pair appears more than once in the proposal.",
      });
      continue;
    }
    seen.add(key);
    if (!pollMatchIds.has(p.match_id)) {
      issues.push({
        severity: "error",
        code: "match_not_in_poll",
        match_id: p.match_id,
        detail: `Match ${p.match_id} is not part of this poll.`,
      });
      continue;
    }
    if (!rosterById.has(p.umpire_id)) {
      issues.push({
        severity: "error",
        code: "umpire_not_in_roster",
        umpire_id: p.umpire_id,
        detail: `Umpire ${p.umpire_id} is not on this club's roster.`,
      });
      continue;
    }
    if (existingTriples.has(key)) {
      issues.push({
        severity: "warning",
        code: "already_assigned",
        match_id: p.match_id,
        umpire_id: p.umpire_id,
        detail:
          "An assignment for this match/umpire pair already exists; the proposal would not change it.",
      });
      continue;
    }
    accepted.push(p);
  }

  // The set under review: this poll's existing assignments plus the accepted
  // proposal, treated as tentative.
  const pollAssignments = existingAssignments.filter(
    (a) => a.poll_id === pollId,
  );
  const reviewed: Assignment[] = [
    ...pollAssignments,
    ...accepted.map((p, i): Assignment => ({
      id: `proposed-${i}`,
      poll_id: pollId,
      match_id: p.match_id,
      umpire_id: p.umpire_id,
      created_at: "",
      organization_id: "",
      status: "tentative",
    })),
  ];

  // Capacity: a match needs exactly two umpires.
  const perMatch = new Map<string, number>();
  for (const a of reviewed) {
    perMatch.set(a.match_id, (perMatch.get(a.match_id) ?? 0) + 1);
  }
  for (const [matchId, count] of perMatch) {
    if (count > 2) {
      issues.push({
        severity: "warning",
        code: "overfilled_match",
        match_id: matchId,
        detail: `Match would have ${count} umpires; it needs exactly 2.`,
      });
    }
  }

  // Eligibility and availability, for every assignment in the poll.
  for (const a of reviewed) {
    const match = matchesById.get(a.match_id);
    const umpire = rosterById.get(a.umpire_id);
    if (!match || !umpire) continue;
    if (umpire.level < match.required_level) {
      issues.push({
        severity: "warning",
        code: "level_mismatch",
        match_id: a.match_id,
        umpire_id: a.umpire_id,
        detail: `${umpire.name} is level ${umpire.level} but the match requires level ${match.required_level}.`,
      });
    }
    const answer = availabilityByMatchUmpire.get(
      availabilityKey(a.match_id, a.umpire_id),
    );
    if (answer === "no") {
      issues.push({
        severity: "warning",
        code: "declined_slot",
        match_id: a.match_id,
        umpire_id: a.umpire_id,
        detail: `${umpire.name} answered "no" for this match's time slot.`,
      });
    } else if (answer === "no_response") {
      issues.push({
        severity: "warning",
        code: "no_response",
        match_id: a.match_id,
        umpire_id: a.umpire_id,
        detail: `${umpire.name} has not responded for this match's time slot.`,
      });
    }
  }

  // Clashes, per umpire, across ALL polls: the reviewed set plus the
  // umpire's assignments elsewhere.
  const otherAssignments = existingAssignments.filter(
    (a) => a.poll_id !== pollId,
  );
  const byUmpire = new Map<string, Assignment[]>();
  for (const a of [...reviewed, ...otherAssignments]) {
    const list = byUmpire.get(a.umpire_id) ?? [];
    list.push(a);
    byUmpire.set(a.umpire_id, list);
  }

  for (const [umpireId, list] of byUmpire) {
    for (let i = 0; i < list.length; i++) {
      for (let j = 0; j < i; j++) {
        const matchA = matchesById.get(list[i].match_id);
        const matchB = matchesById.get(list[j].match_id);
        if (!matchA || !matchB || matchA.id === matchB.id) continue;
        // Only report pairs that involve this poll's set — clashes purely
        // between other polls are not this check's business.
        const involvesPoll =
          list[i].poll_id === pollId || list[j].poll_id === pollId;
        if (!involvesPoll) continue;

        if (matchA.start_time && matchB.start_time) {
          const slotA = calculateSlot(new Date(matchA.start_time));
          const slotB = calculateSlot(new Date(matchB.start_time));
          if (slotsOverlap(slotA, slotB)) {
            issues.push({
              severity: "error",
              code: "double_booking",
              umpire_id: umpireId,
              match_id: matchA.id,
              conflicting_match_id: matchB.id,
              detail: `Umpire is booked on matches ${matchA.id} and ${matchB.id} in overlapping time slots.`,
            });
            continue;
          }
        }
        if (matchA.date === matchB.date) {
          issues.push({
            severity: "warning",
            code: "same_day",
            umpire_id: umpireId,
            match_id: matchA.id,
            conflicting_match_id: matchB.id,
            detail: `Umpire has matches ${matchA.id} and ${matchB.id} on the same day (non-overlapping) — check venues and rest.`,
          });
        }
      }
    }
  }

  return issues;
}

export type SlotRisk = {
  slot_id: string;
  start_time: string;
  end_time: string;
  match_count: number;
  umpires_needed: number;
  yes: number;
  if_need_be: number;
  no: number;
  no_response: number;
  at_risk: boolean;
};

/**
 * Per-slot fill risk for a poll: a slot is at risk when the umpires who said
 * yes or if-need-be are fewer than the two-per-match demand.
 */
export function assessSlotRisk(args: {
  slots: { id: string; start_time: string; end_time: string }[];
  matchCountBySlot: Map<string, number>;
  responsesBySlot: Map<string, Map<string, "yes" | "if_need_be" | "no">>;
  rosterSize: number;
}): SlotRisk[] {
  return args.slots.map((slot) => {
    const responses = args.responsesBySlot.get(slot.id) ?? new Map();
    let yes = 0;
    let ifNeedBe = 0;
    let no = 0;
    for (const answer of responses.values()) {
      if (answer === "yes") yes++;
      else if (answer === "if_need_be") ifNeedBe++;
      else no++;
    }
    const matchCount = args.matchCountBySlot.get(slot.id) ?? 0;
    const needed = matchCount * 2;
    return {
      slot_id: slot.id,
      start_time: slot.start_time,
      end_time: slot.end_time,
      match_count: matchCount,
      umpires_needed: needed,
      yes,
      if_need_be: ifNeedBe,
      no,
      no_response: Math.max(0, args.rosterSize - responses.size),
      at_risk: yes + ifNeedBe < needed,
    };
  });
}

type GapEntry = {
  umpire_id: string;
  name: string;
  level: 1 | 2 | 3;
  availability: AvailabilityAnswer;
  /** Has another non-overlapping assignment on the same day. */
  same_day?: boolean;
};

export type GapSummary = {
  /** Available, qualified, clash-free — the direct fixes for the gap. */
  ready: GapEntry[];
  /** Available but below the match's required level. */
  under_level: GapEntry[];
  /** Available but already booked in an overlapping slot. */
  booked_elsewhere: GapEntry[];
  said_no: GapEntry[];
  no_response: GapEntry[];
  already_assigned: GapEntry[];
};

/**
 * Turn a candidate assessment into an explanation of *why* a match is (or is
 * not) fillable: who could still take it, and into which dead end everyone
 * else falls. Input is assessCandidates output for the match.
 */
export function summarizeGap(candidates: CandidateAssessment[]): GapSummary {
  const summary: GapSummary = {
    ready: [],
    under_level: [],
    booked_elsewhere: [],
    said_no: [],
    no_response: [],
    already_assigned: [],
  };

  for (const c of candidates) {
    const entry: GapEntry = {
      umpire_id: c.umpire_id,
      name: c.name,
      level: c.level,
      availability: c.availability,
    };
    if (c.already_assigned_to_match) {
      summary.already_assigned.push(entry);
      continue;
    }
    if (c.availability === "no") {
      summary.said_no.push(entry);
      continue;
    }
    if (c.availability === "no_response") {
      summary.no_response.push(entry);
      continue;
    }
    if (c.conflicts.some((x) => x.kind === "overlapping_slot")) {
      summary.booked_elsewhere.push(entry);
      continue;
    }
    if (!c.meets_level) {
      summary.under_level.push(entry);
      continue;
    }
    if (c.conflicts.some((x) => x.kind === "same_day")) {
      entry.same_day = true;
    }
    summary.ready.push(entry);
  }

  return summary;
}

export type SwapChain = {
  /** Reassign this umpire from their blocking match to the target match… */
  move: {
    umpire_id: string;
    name: string;
    from_match_id: string;
    to_match_id: string;
    /** tentative moves are Claude-executable; confirmed ones are app actions */
    blocking_assignment_status: AssignmentStatus;
  };
  /** …and put this umpire on the match that was vacated. */
  backfill: {
    umpire_id: string;
    name: string;
    for_match_id: string;
    availability: AvailabilityAnswer;
    level: 1 | 2 | 3;
    workload_confirmed: number;
  };
};

/**
 * One-move repair chains for a match nobody free can take directly: an
 * available, qualified umpire whose only blocker is an overlapping booking
 * in the SAME poll, paired with a replacement who can absorb the vacated
 * match. Backfills who could take the target directly are excluded — they
 * would be direct suggestions, not swaps.
 */
export function findSwapChains(args: {
  targetMatchId: string;
  candidates: CandidateAssessment[];
  pollAssignments: Assignment[];
  matchesById: Map<string, Match>;
  rosterById: Map<string, RosteredUmpire>;
  availabilityByMatchUmpire: Map<string, AvailabilityAnswer>;
  allAssignments: Assignment[];
  workloadByUmpire: Map<string, UmpireWorkload>;
  maxChains: number;
}): SwapChain[] {
  const {
    targetMatchId,
    candidates,
    pollAssignments,
    matchesById,
    rosterById,
    availabilityByMatchUmpire,
    allAssignments,
    workloadByUmpire,
    maxChains,
  } = args;

  const byId = new Map(candidates.map((c) => [c.umpire_id, c]));
  const directReady = new Set(
    candidates
      .filter(
        (c) =>
          (c.availability === "yes" || c.availability === "if_need_be") &&
          c.meets_level &&
          !c.already_assigned_to_match &&
          !c.conflicts.some((x) => x.kind === "overlapping_slot"),
      )
      .map((c) => c.umpire_id),
  );

  const availabilityRank: Record<AvailabilityAnswer, number> = {
    yes: 0,
    if_need_be: 1,
    no_response: 2,
    no: 3,
  };

  const chains: SwapChain[] = [];
  for (const mover of candidates) {
    if (mover.availability !== "yes" && mover.availability !== "if_need_be")
      continue;
    if (!mover.meets_level || mover.already_assigned_to_match) continue;
    const overlaps = mover.conflicts.filter(
      (c) => c.kind === "overlapping_slot",
    );
    if (overlaps.length !== 1) continue; // freeing one match must fully unblock

    const blockingMatchId = overlaps[0].match_id;
    const blocking = pollAssignments.find(
      (a) => a.match_id === blockingMatchId && a.umpire_id === mover.umpire_id,
    );
    if (!blocking) continue; // blocked by another poll — not repairable here
    const blockingMatch = matchesById.get(blockingMatchId);
    if (!blockingMatch?.start_time) continue;
    const blockingSlot = calculateSlot(new Date(blockingMatch.start_time));

    // Anyone booked on the blocking match in ANY poll is out as a backfill
    // — a match can sit in several polls, and a cross-poll assignment still
    // means they already officiate it. (The mover's own row is the one being
    // vacated; they are excluded by id below.)
    const assignedToBlocking = new Set(
      allAssignments
        .filter((a) => a.match_id === blockingMatchId)
        .map((a) => a.umpire_id),
    );

    const backfills = [...rosterById.values()]
      .filter((r) => {
        if (r.id === mover.umpire_id) return false;
        if (assignedToBlocking.has(r.id)) return false;
        if (directReady.has(r.id)) return false;
        if (r.level < blockingMatch.required_level) return false;
        const answer = availabilityByMatchUmpire.get(
          availabilityKey(blockingMatchId, r.id),
        );
        if (answer !== "yes" && answer !== "if_need_be") return false;
        // Clash-free for the vacated match's window. Rows on the blocking
        // match itself never reach this check — assignedToBlocking already
        // excluded those umpires.
        return !allAssignments.some((a) => {
          if (a.umpire_id !== r.id) return false;
          if (a.match_id === blockingMatchId) return false;
          const other = matchesById.get(a.match_id);
          if (!other?.start_time) return false;
          const slot = calculateSlot(new Date(other.start_time));
          return slot.start < blockingSlot.end && blockingSlot.start < slot.end;
        });
      })
      .sort((a, b) => {
        const answerA = availabilityByMatchUmpire.get(
          availabilityKey(blockingMatchId, a.id),
        )!;
        const answerB = availabilityByMatchUmpire.get(
          availabilityKey(blockingMatchId, b.id),
        )!;
        return (
          availabilityRank[answerA] - availabilityRank[answerB] ||
          (workloadByUmpire.get(a.id)?.confirmed ?? 0) -
            (workloadByUmpire.get(b.id)?.confirmed ?? 0) ||
          a.name.localeCompare(b.name)
        );
      });

    for (const backfill of backfills.slice(0, 2)) {
      chains.push({
        move: {
          umpire_id: mover.umpire_id,
          name: mover.name,
          from_match_id: blockingMatchId,
          to_match_id: targetMatchId,
          blocking_assignment_status: blocking.status,
        },
        backfill: {
          umpire_id: backfill.id,
          name: backfill.name,
          for_match_id: blockingMatchId,
          availability: availabilityByMatchUmpire.get(
            availabilityKey(blockingMatchId, backfill.id),
          )!,
          level: backfill.level,
          workload_confirmed: workloadByUmpire.get(backfill.id)?.confirmed ?? 0,
        },
      });
    }
  }

  chains.sort((a, b) => {
    // Fully Claude-executable chains (tentative blocker) first, then the
    // mover's availability for the target, then backfill load.
    const tentA = a.move.blocking_assignment_status === "tentative" ? 0 : 1;
    const tentB = b.move.blocking_assignment_status === "tentative" ? 0 : 1;
    const moverA = byId.get(a.move.umpire_id)!;
    const moverB = byId.get(b.move.umpire_id)!;
    return (
      tentA - tentB ||
      availabilityRank[moverA.availability] -
        availabilityRank[moverB.availability] ||
      a.backfill.workload_confirmed - b.backfill.workload_confirmed
    );
  });

  return chains.slice(0, maxChains);
}

export type SeasonStats = {
  matches: {
    total: number;
    cancelled: number;
    without_time: number;
    filled: number;
    partially_filled: number;
    empty: number;
    /** filled / (total - cancelled), 0..1 rounded to 2 decimals */
    coverage_rate: number;
  };
  load: {
    active_umpires: number;
    avg_confirmed_per_active: number;
    max_confirmed: number;
    most_assigned: { name: string; confirmed: number }[];
    never_assigned: string[];
  };
  responsiveness: {
    polls: number;
    avg_response_rate: number;
    always_silent: string[];
    most_reliable: { name: string; polls_answered: number }[];
  };
  hardest_to_fill: {
    teams: { team: string; unfilled: number }[];
    times_of_day: { morning: number; afternoon: number; evening: number };
  };
};

/** Season-level aggregation for the get_season_stats tool. Pure. */
export function summarizeSeason(args: {
  matches: Match[];
  /** Confirmed-assignment count per match id (matches in range only). */
  confirmedByMatch: Map<string, number>;
  roster: RosteredUmpire[];
  /** Confirmed assignments per umpire, matches in range only. */
  confirmedByUmpire: Map<string, number>;
  /** Distinct polls each umpire answered anything in. */
  pollsAnsweredByUmpire: Map<string, number>;
  totalPolls: number;
  /** Local hour of day (0-23) for a match's start, or null. */
  localHour: (match: Match) => number | null;
}): SeasonStats {
  const {
    matches,
    confirmedByMatch,
    roster,
    confirmedByUmpire,
    pollsAnsweredByUmpire,
    totalPolls,
    localHour,
  } = args;

  const playable = matches.filter((m) => !m.cancelled_upstream);
  let filled = 0;
  let partial = 0;
  let empty = 0;
  const unfilledByTeam = new Map<string, number>();
  const timesOfDay = { morning: 0, afternoon: 0, evening: 0 };
  for (const m of playable) {
    const confirmed = confirmedByMatch.get(m.id) ?? 0;
    if (confirmed >= 2) {
      filled++;
      continue;
    }
    if (confirmed === 1) partial++;
    else empty++;
    unfilledByTeam.set(m.home_team, (unfilledByTeam.get(m.home_team) ?? 0) + 1);
    const hour = localHour(m);
    if (hour !== null) {
      if (hour < 12) timesOfDay.morning++;
      else if (hour < 17) timesOfDay.afternoon++;
      else timesOfDay.evening++;
    }
  }

  const active = roster.filter((u) => (confirmedByUmpire.get(u.id) ?? 0) > 0);
  const counts = active.map((u) => confirmedByUmpire.get(u.id) ?? 0);
  const sum = counts.reduce((a, b) => a + b, 0);

  return {
    matches: {
      total: matches.length,
      cancelled: matches.length - playable.length,
      without_time: playable.filter((m) => !m.start_time).length,
      filled,
      partially_filled: partial,
      empty,
      coverage_rate: playable.length
        ? Math.round((filled / playable.length) * 100) / 100
        : 1,
    },
    load: {
      active_umpires: active.length,
      avg_confirmed_per_active: active.length
        ? Math.round((sum / active.length) * 10) / 10
        : 0,
      max_confirmed: counts.length ? Math.max(...counts) : 0,
      most_assigned: [...active]
        .sort(
          (a, b) =>
            (confirmedByUmpire.get(b.id) ?? 0) -
            (confirmedByUmpire.get(a.id) ?? 0),
        )
        .slice(0, 5)
        .map((u) => ({
          name: u.name,
          confirmed: confirmedByUmpire.get(u.id) ?? 0,
        })),
      never_assigned: roster
        .filter((u) => !(confirmedByUmpire.get(u.id) ?? 0))
        .map((u) => u.name),
    },
    responsiveness: {
      polls: totalPolls,
      avg_response_rate:
        totalPolls && roster.length
          ? Math.round(
              (roster.reduce(
                (acc, u) => acc + (pollsAnsweredByUmpire.get(u.id) ?? 0),
                0,
              ) /
                (totalPolls * roster.length)) *
                100,
            ) / 100
          : 0,
      always_silent: roster
        .filter((u) => !(pollsAnsweredByUmpire.get(u.id) ?? 0))
        .map((u) => u.name),
      most_reliable: [...roster]
        .filter((u) => (pollsAnsweredByUmpire.get(u.id) ?? 0) > 0)
        .sort(
          (a, b) =>
            (pollsAnsweredByUmpire.get(b.id) ?? 0) -
            (pollsAnsweredByUmpire.get(a.id) ?? 0),
        )
        .slice(0, 5)
        .map((u) => ({
          name: u.name,
          polls_answered: pollsAnsweredByUmpire.get(u.id) ?? 0,
        })),
    },
    hardest_to_fill: {
      teams: [...unfilledByTeam.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([team, unfilled]) => ({ team, unfilled })),
      times_of_day: timesOfDay,
    },
  };
}
