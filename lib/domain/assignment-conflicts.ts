import { calculateSlot } from "@/lib/domain/slots";
import type { Match, Assignment } from "@/lib/types/domain";

export type AssignmentConflict = {
  umpireId: string;
  matchId: string;
  conflictingMatchId: string;
  severity: "hard" | "soft";
};

function slotsOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean {
  return a.start < b.end && b.start < a.end;
}

function sameDay(dateA: string, dateB: string): boolean {
  return dateA === dateB;
}

export function findConflicts(
  assignments: Assignment[],
  matches: Match[],
): AssignmentConflict[] {
  const matchMap = new Map(matches.map((m) => [m.id, m]));
  const conflicts: AssignmentConflict[] = [];

  // Group assignments by umpire
  const byUmpire = new Map<string, Assignment[]>();
  for (const a of assignments) {
    if (!byUmpire.has(a.umpire_id)) byUmpire.set(a.umpire_id, []);
    byUmpire.get(a.umpire_id)!.push(a);
  }

  for (const [umpireId, umpireAssignments] of byUmpire) {
    if (umpireAssignments.length < 2) continue;

    for (let i = 0; i < umpireAssignments.length; i++) {
      for (let j = 0; j < i; j++) {
        const matchA = matchMap.get(umpireAssignments[i].match_id);
        const matchB = matchMap.get(umpireAssignments[j].match_id);
        if (!matchA?.start_time || !matchB?.start_time) continue;

        const slotA = calculateSlot(new Date(matchA.start_time));
        const slotB = calculateSlot(new Date(matchB.start_time));

        if (slotsOverlap(slotA, slotB)) {
          conflicts.push({
            umpireId,
            matchId: matchA.id,
            conflictingMatchId: matchB.id,
            severity: "hard",
          });
          conflicts.push({
            umpireId,
            matchId: matchB.id,
            conflictingMatchId: matchA.id,
            severity: "hard",
          });
        } else if (sameDay(matchA.date, matchB.date)) {
          conflicts.push({
            umpireId,
            matchId: matchA.id,
            conflictingMatchId: matchB.id,
            severity: "soft",
          });
          conflicts.push({
            umpireId,
            matchId: matchB.id,
            conflictingMatchId: matchA.id,
            severity: "soft",
          });
        }
      }
    }
  }

  return conflicts;
}
