import { describe, it, expect } from "vitest";
import {
  assessCandidates,
  checkAssignmentSet,
  summarizeGap,
  findSwapChains,
  summarizeSeason,
  assessSlotRisk,
  availabilityKey,
  EMPTY_WORKLOAD,
  type AvailabilityAnswer,
} from "@/lib/mcp/planning";
import type { Match, Assignment, RosteredUmpire } from "@/lib/types/domain";
import { matchColumnDefaults } from "@/__tests__/helpers/fixtures";

function makeMatch(overrides: Partial<Match> & { id: string }): Match {
  return {
    ...matchColumnDefaults,
    date: "2026-03-15",
    start_time: "2026-03-15T11:00:00Z",
    home_team: "Team A",
    away_team: "Team B",
    competition: null,
    venue: null,
    field: null,
    notes: null,
    required_level: 1,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "test-org-id",
    ...overrides,
  };
}

function makeAssignment(
  overrides: Partial<Assignment> & { match_id: string; umpire_id: string },
): Assignment {
  return {
    id: "a-" + overrides.match_id + "-" + overrides.umpire_id,
    poll_id: "poll-1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "test-org-id",
    status: "confirmed",
    ...overrides,
  };
}

function makeUmpire(
  overrides: Partial<RosteredUmpire> & { id: string; name: string },
): RosteredUmpire {
  return {
    auth_user_id: null,
    email: `${overrides.id}@example.com`,
    level: 2,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    notes: null,
    ...overrides,
  };
}

describe("assessCandidates", () => {
  const match = makeMatch({ id: "m1", required_level: 2 });

  it("ranks yes before if_need_be before no_response before no", () => {
    const roster = [
      makeUmpire({ id: "u-no", name: "No" }),
      makeUmpire({ id: "u-yes", name: "Yes" }),
      makeUmpire({ id: "u-silent", name: "Silent" }),
      makeUmpire({ id: "u-ifb", name: "IfNeedBe" }),
    ];
    const result = assessCandidates({
      match,
      roster,
      slotResponses: new Map([
        ["u-no", "no"],
        ["u-yes", "yes"],
        ["u-ifb", "if_need_be"],
      ]),
      assignments: [],
      matchesById: new Map([[match.id, match]]),
      workloadByUmpire: new Map(),
    });
    expect(result.map((c) => c.umpire_id)).toEqual([
      "u-yes",
      "u-ifb",
      "u-silent",
      "u-no",
    ]);
    expect(result[2].availability).toBe("no_response");
  });

  it("flags level shortfalls but keeps qualified candidates first", () => {
    const roster = [
      makeUmpire({ id: "u-low", name: "Low", level: 1 }),
      makeUmpire({ id: "u-ok", name: "Ok", level: 2 }),
    ];
    const result = assessCandidates({
      match,
      roster,
      slotResponses: new Map([
        ["u-low", "yes"],
        ["u-ok", "yes"],
      ]),
      assignments: [],
      matchesById: new Map([[match.id, match]]),
      workloadByUmpire: new Map(),
    });
    expect(result[0].umpire_id).toBe("u-ok");
    expect(result[0].meets_level).toBe(true);
    expect(result[1].meets_level).toBe(false);
  });

  it("detects overlapping-slot and same-day conflicts from other assignments", () => {
    const overlapping = makeMatch({
      id: "m2",
      start_time: "2026-03-15T11:30:00Z",
    });
    const sameDay = makeMatch({
      id: "m3",
      start_time: "2026-03-15T16:00:00Z",
    });
    const roster = [
      makeUmpire({ id: "u1", name: "Busy" }),
      makeUmpire({ id: "u2", name: "Later" }),
    ];
    const result = assessCandidates({
      match,
      roster,
      slotResponses: new Map([
        ["u1", "yes"],
        ["u2", "yes"],
      ]),
      assignments: [
        makeAssignment({ match_id: "m2", umpire_id: "u1" }),
        makeAssignment({
          match_id: "m3",
          umpire_id: "u2",
          status: "tentative",
        }),
      ],
      matchesById: new Map([
        [match.id, match],
        [overlapping.id, overlapping],
        [sameDay.id, sameDay],
      ]),
      workloadByUmpire: new Map(),
    });
    const busy = result.find((c) => c.umpire_id === "u1")!;
    expect(busy.conflicts).toEqual([
      { match_id: "m2", kind: "overlapping_slot", status: "confirmed" },
    ]);
    const later = result.find((c) => c.umpire_id === "u2")!;
    expect(later.conflicts).toEqual([
      { match_id: "m3", kind: "same_day", status: "tentative" },
    ]);
  });

  it("marks umpires already assigned to the match without listing it as a conflict", () => {
    const roster = [makeUmpire({ id: "u1", name: "Assigned" })];
    const result = assessCandidates({
      match,
      roster,
      slotResponses: new Map([["u1", "yes"]]),
      assignments: [makeAssignment({ match_id: "m1", umpire_id: "u1" })],
      matchesById: new Map([[match.id, match]]),
      workloadByUmpire: new Map(),
    });
    expect(result[0].already_assigned_to_match).toBe(true);
    expect(result[0].conflicts).toEqual([]);
  });

  it("ranks a double-booked yes below any clash-free candidate", () => {
    const overlapping = makeMatch({
      id: "m2",
      start_time: "2026-03-15T11:30:00Z",
    });
    const roster = [
      makeUmpire({ id: "u-booked", name: "BookedYes" }),
      makeUmpire({ id: "u-free", name: "FreeIfb" }),
      makeUmpire({ id: "u-silent", name: "Silent" }),
    ];
    const result = assessCandidates({
      match,
      roster,
      slotResponses: new Map([
        ["u-booked", "yes"],
        ["u-free", "if_need_be"],
      ]),
      assignments: [makeAssignment({ match_id: "m2", umpire_id: "u-booked" })],
      matchesById: new Map([
        [match.id, match],
        [overlapping.id, overlapping],
      ]),
      workloadByUmpire: new Map(),
    });
    expect(result.map((c) => c.umpire_id)).toEqual([
      "u-free",
      "u-silent",
      "u-booked",
    ]);
  });

  it("prefers the umpire with fewer confirmed assignments when otherwise equal", () => {
    const roster = [
      makeUmpire({ id: "u-heavy", name: "Heavy" }),
      makeUmpire({ id: "u-light", name: "Light" }),
    ];
    const result = assessCandidates({
      match,
      roster,
      slotResponses: new Map([
        ["u-heavy", "yes"],
        ["u-light", "yes"],
      ]),
      assignments: [],
      matchesById: new Map([[match.id, match]]),
      workloadByUmpire: new Map([
        ["u-heavy", { ...EMPTY_WORKLOAD, confirmed: 5 }],
        ["u-light", { ...EMPTY_WORKLOAD, confirmed: 1 }],
      ]),
    });
    expect(result.map((c) => c.umpire_id)).toEqual(["u-light", "u-heavy"]);
  });
});

describe("checkAssignmentSet", () => {
  const m1 = makeMatch({ id: "m1", required_level: 2 });
  const m2 = makeMatch({ id: "m2", start_time: "2026-03-15T11:30:00Z" });
  const roster = new Map(
    [
      makeUmpire({ id: "u1", name: "One", level: 2 }),
      makeUmpire({ id: "u2", name: "Two", level: 1 }),
    ].map((u) => [u.id, u]),
  );
  const matchesById = new Map([
    [m1.id, m1],
    [m2.id, m2],
  ]);

  function check(args: {
    proposed?: { match_id: string; umpire_id: string }[];
    existing?: Assignment[];
    availability?: [string, string, AvailabilityAnswer][];
  }) {
    return checkAssignmentSet({
      pollId: "poll-1",
      pollMatchIds: new Set(["m1", "m2"]),
      rosterById: roster,
      matchesById,
      existingAssignments: args.existing ?? [],
      proposed: args.proposed ?? [],
      availabilityByMatchUmpire: new Map(
        (args.availability ?? []).map(([m, u, a]) => [
          availabilityKey(m, u),
          a,
        ]),
      ),
    });
  }

  it("returns no issues for a clean proposal", () => {
    const issues = check({
      proposed: [{ match_id: "m1", umpire_id: "u1" }],
      availability: [["m1", "u1", "yes"]],
    });
    expect(issues).toEqual([]);
  });

  it("rejects matches outside the poll and unknown umpires", () => {
    const issues = check({
      proposed: [
        { match_id: "m-elsewhere", umpire_id: "u1" },
        { match_id: "m1", umpire_id: "u-ghost" },
      ],
      availability: [],
    });
    expect(issues.map((i) => i.code).sort()).toEqual([
      "match_not_in_poll",
      "umpire_not_in_roster",
    ]);
    expect(issues.every((i) => i.severity === "error")).toBe(true);
  });

  it("flags duplicates and already-existing assignments", () => {
    const issues = check({
      proposed: [
        { match_id: "m1", umpire_id: "u1" },
        { match_id: "m1", umpire_id: "u1" },
        { match_id: "m2", umpire_id: "u2" },
      ],
      existing: [makeAssignment({ match_id: "m2", umpire_id: "u2" })],
      availability: [
        ["m1", "u1", "yes"],
        ["m2", "u2", "yes"],
      ],
    });
    expect(issues.map((i) => i.code).sort()).toEqual([
      "already_assigned",
      "duplicate_in_proposal",
    ]);
  });

  it("warns on level mismatch, declined slot, no response, and overfilled match", () => {
    const issues = check({
      proposed: [
        { match_id: "m1", umpire_id: "u2" }, // level 1 < required 2, said no
      ],
      existing: [
        makeAssignment({ match_id: "m1", umpire_id: "u1" }),
        makeAssignment({
          match_id: "m1",
          umpire_id: "u3",
          status: "tentative",
        }),
      ],
      availability: [
        ["m1", "u2", "no"],
        ["m1", "u1", "no_response"],
      ],
    });
    const codes = issues.map((i) => i.code);
    expect(codes).toContain("level_mismatch");
    expect(codes).toContain("declined_slot");
    expect(codes).toContain("no_response");
    expect(codes).toContain("overfilled_match");
    expect(issues.every((i) => i.severity === "warning")).toBe(true);
  });

  it("reports overlapping bookings as errors, including against other polls", () => {
    const issues = check({
      proposed: [{ match_id: "m1", umpire_id: "u1" }],
      existing: [
        makeAssignment({
          match_id: "m2",
          umpire_id: "u1",
          poll_id: "poll-other",
        }),
      ],
      availability: [["m1", "u1", "yes"]],
    });
    const clash = issues.find((i) => i.code === "double_booking")!;
    expect(clash.severity).toBe("error");
    // Both matches of the pair are identified so callers can block both.
    expect([clash.match_id, clash.conflicting_match_id].sort()).toEqual([
      "m1",
      "m2",
    ]);
  });

  it("audits the existing state when the proposal is empty", () => {
    const issues = check({
      existing: [
        makeAssignment({ match_id: "m1", umpire_id: "u2" }), // level shortfall
      ],
      availability: [["m1", "u2", "no"]],
    });
    expect(issues.map((i) => i.code).sort()).toEqual([
      "declined_slot",
      "level_mismatch",
    ]);
  });
});

describe("assessSlotRisk", () => {
  it("computes supply, demand, silence, and risk per slot", () => {
    const risks = assessSlotRisk({
      slots: [
        {
          id: "s1",
          start_time: "2026-03-15T10:30:00Z",
          end_time: "2026-03-15T12:30:00Z",
        },
        {
          id: "s2",
          start_time: "2026-03-15T14:00:00Z",
          end_time: "2026-03-15T16:00:00Z",
        },
      ],
      matchCountBySlot: new Map([
        ["s1", 2],
        ["s2", 1],
      ]),
      responsesBySlot: new Map([
        [
          "s1",
          new Map([
            ["u1", "yes"],
            ["u2", "if_need_be"],
            ["u3", "no"],
          ] as [string, "yes" | "if_need_be" | "no"][]),
        ],
        [
          "s2",
          new Map([
            ["u1", "yes"],
            ["u2", "yes"],
          ] as [string, "yes" | "if_need_be" | "no"][]),
        ],
      ]),
      rosterSize: 5,
    });

    expect(risks[0]).toMatchObject({
      slot_id: "s1",
      umpires_needed: 4,
      yes: 1,
      if_need_be: 1,
      no: 1,
      no_response: 2,
      at_risk: true,
    });
    expect(risks[1]).toMatchObject({
      slot_id: "s2",
      umpires_needed: 2,
      yes: 2,
      at_risk: false,
    });
  });
});

describe("summarizeGap", () => {
  function candidate(
    over: Partial<import("@/lib/mcp/planning").CandidateAssessment> & {
      umpire_id: string;
      name: string;
    },
  ): import("@/lib/mcp/planning").CandidateAssessment {
    return {
      level: 2,
      availability: "yes",
      meets_level: true,
      already_assigned_to_match: false,
      conflicts: [],
      notes: null,
      workload: EMPTY_WORKLOAD,
      ...over,
    };
  }

  it("buckets every candidate into exactly one explanation", () => {
    const summary = summarizeGap([
      candidate({ umpire_id: "a", name: "Ready" }),
      candidate({
        umpire_id: "b",
        name: "SameDay",
        conflicts: [{ match_id: "x", kind: "same_day", status: "confirmed" }],
      }),
      candidate({
        umpire_id: "c",
        name: "Booked",
        conflicts: [
          { match_id: "x", kind: "overlapping_slot", status: "confirmed" },
        ],
      }),
      candidate({ umpire_id: "d", name: "Low", meets_level: false }),
      candidate({ umpire_id: "e", name: "No", availability: "no" }),
      candidate({
        umpire_id: "f",
        name: "Silent",
        availability: "no_response",
      }),
      candidate({
        umpire_id: "g",
        name: "OnIt",
        already_assigned_to_match: true,
      }),
    ]);

    expect(summary.ready.map((r) => r.name)).toEqual(["Ready", "SameDay"]);
    expect(summary.ready[1].same_day).toBe(true);
    expect(summary.booked_elsewhere.map((r) => r.name)).toEqual(["Booked"]);
    expect(summary.under_level.map((r) => r.name)).toEqual(["Low"]);
    expect(summary.said_no.map((r) => r.name)).toEqual(["No"]);
    expect(summary.no_response.map((r) => r.name)).toEqual(["Silent"]);
    expect(summary.already_assigned.map((r) => r.name)).toEqual(["OnIt"]);
  });

  it("said no beats booked-elsewhere as the explanation", () => {
    const summary = summarizeGap([
      candidate({
        umpire_id: "a",
        name: "NoAndBusy",
        availability: "no",
        conflicts: [
          { match_id: "x", kind: "overlapping_slot", status: "confirmed" },
        ],
      }),
    ]);
    expect(summary.said_no).toHaveLength(1);
    expect(summary.booked_elsewhere).toHaveLength(0);
  });
});

describe("findSwapChains", () => {
  const target = makeMatch({ id: "t1", start_time: "2026-03-15T11:00:00Z" });
  const blocking = makeMatch({ id: "m2", start_time: "2026-03-15T11:30:00Z" });
  const roster = [
    makeUmpire({ id: "u-mover", name: "Mover" }),
    makeUmpire({ id: "u-backfill", name: "Backfill" }),
  ];
  const matchesById = new Map([
    [target.id, target],
    [blocking.id, blocking],
  ]);

  function chainsFor(over: {
    blockingStatus?: "tentative" | "confirmed";
    blockingPoll?: string;
    backfillAnswerForTarget?: AvailabilityAnswer;
  }) {
    const blockingAssignment = makeAssignment({
      match_id: "m2",
      umpire_id: "u-mover",
      status: over.blockingStatus ?? "tentative",
      poll_id: over.blockingPoll ?? "poll-1",
    });
    const candidates = assessCandidates({
      match: target,
      roster,
      slotResponses: new Map([
        ["u-mover", "yes"],
        // backfill's answer for the TARGET slot decides direct-readiness
        ...(over.backfillAnswerForTarget === "yes"
          ? ([["u-backfill", "yes"]] as ["u-backfill", "yes"][])
          : []),
      ]),
      assignments: [blockingAssignment],
      matchesById,
      workloadByUmpire: new Map(),
    });
    return findSwapChains({
      targetMatchId: "t1",
      candidates,
      pollAssignments:
        blockingAssignment.poll_id === "poll-1" ? [blockingAssignment] : [],
      matchesById,
      rosterById: new Map(roster.map((u) => [u.id, u])),
      availabilityByMatchUmpire: new Map([
        [availabilityKey("m2", "u-backfill"), "yes"],
        [availabilityKey("t1", "u-mover"), "yes"],
      ]),
      allAssignments: [blockingAssignment],
      workloadByUmpire: new Map(),
      maxChains: 5,
    });
  }

  it("finds a one-move chain freeing a blocked yes", () => {
    const chains = chainsFor({});
    expect(chains).toHaveLength(1);
    expect(chains[0].move).toMatchObject({
      umpire_id: "u-mover",
      from_match_id: "m2",
      to_match_id: "t1",
      blocking_assignment_status: "tentative",
    });
    expect(chains[0].backfill).toMatchObject({
      umpire_id: "u-backfill",
      for_match_id: "m2",
      availability: "yes",
    });
  });

  it("reports a confirmed blocker as app-only", () => {
    const chains = chainsFor({ blockingStatus: "confirmed" });
    expect(chains[0].move.blocking_assignment_status).toBe("confirmed");
  });

  it("skips blockers whose booking lives in another poll", () => {
    expect(chainsFor({ blockingPoll: "poll-other" })).toHaveLength(0);
  });

  it("excludes backfills who could take the target directly", () => {
    expect(chainsFor({ backfillAnswerForTarget: "yes" })).toHaveLength(0);
  });

  it("excludes backfills already on the blocking match via another poll", () => {
    const blockingAssignment = makeAssignment({
      match_id: "m2",
      umpire_id: "u-mover",
      status: "tentative",
      poll_id: "poll-1",
    });
    const crossPoll = makeAssignment({
      match_id: "m2",
      umpire_id: "u-backfill",
      status: "confirmed",
      poll_id: "poll-other",
    });
    const chains = findSwapChains({
      targetMatchId: "t1",
      candidates: assessCandidates({
        match: target,
        roster,
        slotResponses: new Map([["u-mover", "yes"]]),
        assignments: [blockingAssignment, crossPoll],
        matchesById,
        workloadByUmpire: new Map(),
      }),
      pollAssignments: [blockingAssignment],
      matchesById,
      rosterById: new Map(roster.map((u) => [u.id, u])),
      availabilityByMatchUmpire: new Map([
        [availabilityKey("m2", "u-backfill"), "yes"],
        [availabilityKey("t1", "u-mover"), "yes"],
      ]),
      allAssignments: [blockingAssignment, crossPoll],
      workloadByUmpire: new Map(),
      maxChains: 5,
    });
    expect(chains).toHaveLength(0);
  });
});

describe("summarizeSeason", () => {
  it("aggregates coverage, load, responsiveness, and hard-to-fill", () => {
    const matches = [
      makeMatch({ id: "m1", start_time: "2026-03-15T08:00:00Z" }), // filled
      makeMatch({
        id: "m2",
        home_team: "MO12-1",
        start_time: "2026-03-15T07:00:00Z", // morning local
      }), // empty
      makeMatch({ id: "m3", cancelled_upstream: true }),
    ];
    const roster = [
      makeUmpire({ id: "u1", name: "Busy" }),
      makeUmpire({ id: "u2", name: "Quiet" }),
    ];
    const stats = summarizeSeason({
      matches,
      confirmedByMatch: new Map([["m1", 2]]),
      roster,
      confirmedByUmpire: new Map([["u1", 2]]),
      pollsAnsweredByUmpire: new Map([["u1", 2]]),
      totalPolls: 2,
      localHour: (m) =>
        m.start_time ? new Date(m.start_time).getUTCHours() + 1 : null,
    });

    expect(stats.matches).toMatchObject({
      total: 3,
      cancelled: 1,
      filled: 1,
      empty: 1,
      coverage_rate: 0.5,
    });
    expect(stats.load.most_assigned).toEqual([{ name: "Busy", confirmed: 2 }]);
    expect(stats.load.never_assigned).toEqual(["Quiet"]);
    expect(stats.responsiveness.always_silent).toEqual(["Quiet"]);
    expect(stats.responsiveness.avg_response_rate).toBe(0.5);
    expect(stats.hardest_to_fill.teams).toEqual([
      { team: "MO12-1", unfilled: 1 },
    ]);
    expect(stats.hardest_to_fill.times_of_day.morning).toBe(1);
  });
});
