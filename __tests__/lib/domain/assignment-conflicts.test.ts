import { describe, it, expect } from "vitest";
import { findConflicts } from "@/lib/domain/assignment-conflicts";
import type { Match, Assignment } from "@/lib/types/domain";

function makeMatch(overrides: Partial<Match> & { id: string }): Match {
  return {
    date: "2026-03-15",
    start_time: "2026-03-15T11:00:00Z",
    home_team: "Team A",
    away_team: "Team B",
    competition: null,
    venue: null,
    field: null,
    required_level: 1,
    created_by: "user-1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "test-org-id",
    ...overrides,
  };
}

function makeAssignment(
  overrides: Partial<Assignment> & {
    match_id: string;
    umpire_id: string;
  },
): Assignment {
  return {
    id: "a-" + overrides.match_id + "-" + overrides.umpire_id,
    poll_id: "poll-1",
    created_at: "2026-01-01T00:00:00Z",
    organization_id: "test-org-id",
    ...overrides,
  };
}

describe("findConflicts", () => {
  it("returns empty array when no conflicts exist", () => {
    const matches = [
      makeMatch({
        id: "m1",
        date: "2026-03-15",
        start_time: "2026-03-15T11:00:00Z",
      }),
      makeMatch({
        id: "m2",
        date: "2026-03-16",
        start_time: "2026-03-16T11:00:00Z",
      }),
    ];
    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1" }),
      makeAssignment({ match_id: "m2", umpire_id: "u1" }),
    ];
    const conflicts = findConflicts(assignments, matches);
    expect(conflicts).toEqual([]);
  });

  it("detects hard conflict: same umpire assigned to overlapping time slots", () => {
    const matches = [
      makeMatch({
        id: "m1",
        date: "2026-03-15",
        start_time: "2026-03-15T11:00:00Z",
      }),
      makeMatch({
        id: "m2",
        date: "2026-03-15",
        start_time: "2026-03-15T11:30:00Z",
      }),
    ];
    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1" }),
      makeAssignment({ match_id: "m2", umpire_id: "u1" }),
    ];
    const conflicts = findConflicts(assignments, matches);
    expect(conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          umpireId: "u1",
          matchId: "m2",
          conflictingMatchId: "m1",
          severity: "hard",
        }),
      ]),
    );
  });

  it("detects soft conflict: same umpire assigned to different slots on same day", () => {
    const matches = [
      makeMatch({
        id: "m1",
        date: "2026-03-15",
        start_time: "2026-03-15T09:00:00Z",
      }),
      makeMatch({
        id: "m2",
        date: "2026-03-15",
        start_time: "2026-03-15T15:00:00Z",
      }),
    ];
    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1" }),
      makeAssignment({ match_id: "m2", umpire_id: "u1" }),
    ];
    const conflicts = findConflicts(assignments, matches);
    expect(conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          umpireId: "u1",
          matchId: "m2",
          conflictingMatchId: "m1",
          severity: "soft",
        }),
      ]),
    );
  });

  it("does not flag different umpires assigned to same match", () => {
    const matches = [
      makeMatch({
        id: "m1",
        date: "2026-03-15",
        start_time: "2026-03-15T11:00:00Z",
      }),
    ];
    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1" }),
      makeAssignment({ match_id: "m1", umpire_id: "u2" }),
    ];
    const conflicts = findConflicts(assignments, matches);
    expect(conflicts).toEqual([]);
  });

  it("returns conflicts for multiple umpires independently", () => {
    const matches = [
      makeMatch({
        id: "m1",
        date: "2026-03-15",
        start_time: "2026-03-15T11:00:00Z",
      }),
      makeMatch({
        id: "m2",
        date: "2026-03-15",
        start_time: "2026-03-15T11:15:00Z",
      }),
    ];
    const assignments = [
      makeAssignment({ match_id: "m1", umpire_id: "u1" }),
      makeAssignment({ match_id: "m2", umpire_id: "u1" }),
      makeAssignment({ match_id: "m1", umpire_id: "u2" }),
      makeAssignment({ match_id: "m2", umpire_id: "u2" }),
    ];
    const conflicts = findConflicts(assignments, matches);
    const u1Conflicts = conflicts.filter((c) => c.umpireId === "u1");
    const u2Conflicts = conflicts.filter((c) => c.umpireId === "u2");
    expect(u1Conflicts.length).toBeGreaterThanOrEqual(1);
    expect(u2Conflicts.length).toBeGreaterThanOrEqual(1);
  });
});
