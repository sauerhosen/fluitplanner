"use client";

import { useState, useMemo, useCallback } from "react";
import { Check, Ban, AlertTriangle, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createAssignment, deleteAssignment } from "@/lib/actions/assignments";
import { mapMatchesToSlots } from "@/lib/domain/match-slot-mapping";
import {
  findConflicts,
  type AssignmentConflict,
} from "@/lib/domain/assignment-conflicts";
import type {
  Match,
  PollSlot,
  AvailabilityResponse,
  Assignment,
  Umpire,
} from "@/lib/types/domain";

type Props = {
  pollId: string;
  matches: Match[];
  slots: PollSlot[];
  responses: AvailabilityResponse[];
  assignments: Assignment[];
  umpires: Umpire[];
};

const AVAILABILITY_COLORS: Record<string, string> = {
  yes: "bg-green-100 dark:bg-green-900/30",
  if_need_be: "bg-yellow-100 dark:bg-yellow-900/30",
  no: "bg-red-100 dark:bg-red-900/30",
};

const NO_RESPONSE_COLOR = "bg-muted/50";

export function AssignmentGrid({
  pollId,
  matches,
  slots,
  responses,
  assignments: initialAssignments,
  umpires,
}: Props) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [saving, setSaving] = useState<string | null>(null);
  const [transposed, setTransposed] = useState(false);

  const matchSlotMap = useMemo(
    () => mapMatchesToSlots(matches, slots),
    [matches, slots],
  );

  const responseMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    for (const r of responses) {
      if (!r.umpire_id) continue;
      if (!map.has(r.slot_id)) map.set(r.slot_id, new Map());
      map.get(r.slot_id)!.set(r.umpire_id, r.response);
    }
    return map;
  }, [responses]);

  const assignmentSet = useMemo(() => {
    const set = new Set<string>();
    for (const a of assignments) {
      set.add(`${a.match_id}-${a.umpire_id}`);
    }
    return set;
  }, [assignments]);

  const assignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assignments) {
      counts.set(a.match_id, (counts.get(a.match_id) ?? 0) + 1);
    }
    return counts;
  }, [assignments]);

  const conflicts = useMemo(
    () => findConflicts(assignments, matches),
    [assignments, matches],
  );

  const conflictMap = useMemo(() => {
    const map = new Map<string, AssignmentConflict>();
    for (const c of conflicts) {
      const key = `${c.matchId}-${c.umpireId}`;
      const existing = map.get(key);
      if (!existing || c.severity === "hard") {
        map.set(key, c);
      }
    }
    return map;
  }, [conflicts]);

  function getAvailability(matchId: string, umpireId: string): string | null {
    const slotId = matchSlotMap.get(matchId);
    if (!slotId) return null;
    return responseMap.get(slotId)?.get(umpireId) ?? null;
  }

  const handleToggle = useCallback(
    async (matchId: string, umpireId: string) => {
      const key = `${matchId}-${umpireId}`;
      if (saving) return;

      const isAssigned = assignmentSet.has(key);
      const count = assignmentCounts.get(matchId) ?? 0;

      if (!isAssigned && count >= 2) {
        toast.warning("This match already has 2 umpires assigned");
      }

      setSaving(key);
      if (isAssigned) {
        setAssignments((prev) =>
          prev.filter(
            (a) => !(a.match_id === matchId && a.umpire_id === umpireId),
          ),
        );
      } else {
        setAssignments((prev) => [
          ...prev,
          {
            id: `temp-${key}`,
            poll_id: pollId,
            match_id: matchId,
            umpire_id: umpireId,
            created_at: new Date().toISOString(),
          },
        ]);
      }

      try {
        if (isAssigned) {
          await deleteAssignment(pollId, matchId, umpireId);
        } else {
          const result = await createAssignment(pollId, matchId, umpireId);
          setAssignments((prev) =>
            prev.map((a) => (a.id === `temp-${key}` ? result : a)),
          );
        }
      } catch {
        setAssignments(
          isAssigned
            ? (prev) => [
                ...prev,
                {
                  id: `reverted-${key}`,
                  poll_id: pollId,
                  match_id: matchId,
                  umpire_id: umpireId,
                  created_at: new Date().toISOString(),
                },
              ]
            : (prev) =>
                prev.filter(
                  (a) => !(a.match_id === matchId && a.umpire_id === umpireId),
                ),
        );
        toast.error("Failed to save assignment");
      } finally {
        setSaving(null);
      }
    },
    [saving, assignmentSet, assignmentCounts, pollId, setAssignments],
  );

  const sortedMatches = useMemo(
    () =>
      [...matches].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.start_time ?? "").localeCompare(b.start_time ?? "");
      }),
    [matches],
  );

  if (umpires.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No umpire responses yet. Share the poll to collect availability before
        making assignments.
      </p>
    );
  }

  function renderCell(matchId: string, umpireId: string) {
    const key = `${matchId}-${umpireId}`;
    const isAssigned = assignmentSet.has(key);
    const availability = getAvailability(matchId, umpireId);
    const conflict = conflictMap.get(key);
    const isSaving = saving === key;

    const bgColor = availability
      ? AVAILABILITY_COLORS[availability]
      : NO_RESPONSE_COLOR;

    const conflictBorder = conflict
      ? conflict.severity === "hard"
        ? "ring-2 ring-red-500"
        : "ring-2 ring-orange-400"
      : "";

    const assignedStyle =
      isAssigned && !conflict ? "ring-2 ring-primary font-bold" : "";

    const title = conflict
      ? conflict.severity === "hard"
        ? "Conflict: umpire has overlapping match"
        : "Warning: umpire has another match same day"
      : isAssigned
        ? "Assigned"
        : undefined;

    return (
      <button
        key={key}
        data-testid={`cell-${key}`}
        title={title}
        className={`relative flex h-10 w-full min-w-10 items-center justify-center rounded transition-all ${bgColor} ${conflictBorder || assignedStyle} ${isSaving ? "opacity-50" : "cursor-pointer hover:opacity-80"}`}
        onClick={() => handleToggle(matchId, umpireId)}
        disabled={isSaving}
      >
        {isAssigned && !conflict && <Check className="h-4 w-4 text-primary" />}
        {isAssigned && conflict?.severity === "hard" && (
          <Ban className="h-4 w-4 text-red-500" />
        )}
        {isAssigned && conflict?.severity === "soft" && (
          <AlertTriangle className="h-4 w-4 text-orange-500" />
        )}
      </button>
    );
  }

  function renderCountBadge(matchId: string) {
    const count = assignmentCounts.get(matchId) ?? 0;
    const variant =
      count === 2 ? "default" : count > 2 ? "destructive" : "secondary";
    return <Badge variant={variant}>{count}/2</Badge>;
  }

  if (!transposed) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setTransposed(true)}
            aria-label="Swap rows and columns"
          >
            <ArrowRightLeft className="mr-2 h-4 w-4" />
            Swap axes
          </Button>
        </div>
        <div className="scrollbar-visible overflow-x-auto pb-2">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left p-2 font-medium sticky left-0 z-10 bg-background min-w-48">
                  Match
                </th>
                <th className="p-2 text-center font-medium min-w-12" />
                {umpires.map((u) => (
                  <th
                    key={u.id}
                    className="p-2 text-center font-medium whitespace-nowrap min-w-20"
                  >
                    {u.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMatches.map((match) => (
                <tr key={match.id} className="border-b">
                  <td className="p-2 sticky left-0 z-10 bg-background">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {match.home_team} &ndash; {match.away_team}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(match.date).toLocaleDateString("nl-NL", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                        {match.start_time &&
                          ` ${new Date(match.start_time).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`}
                      </span>
                    </div>
                  </td>
                  <td className="p-2 text-center">
                    {renderCountBadge(match.id)}
                  </td>
                  {umpires.map((u) => (
                    <td key={u.id} className="p-1">
                      {renderCell(match.id, u.id)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setTransposed(false)}
          aria-label="Swap rows and columns"
        >
          <ArrowRightLeft className="mr-2 h-4 w-4" />
          Swap axes
        </Button>
      </div>
      <div className="scrollbar-visible overflow-x-auto pb-2">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="text-left p-2 font-medium sticky left-0 z-10 bg-background min-w-32">
                Umpire
              </th>
              {sortedMatches.map((match) => (
                <th
                  key={match.id}
                  className="p-2 text-center font-medium whitespace-nowrap min-w-24"
                >
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                      {new Date(match.date).toLocaleDateString("nl-NL", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <span className="text-[11px]">
                      {match.home_team} &ndash; {match.away_team}
                    </span>
                    {renderCountBadge(match.id)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {umpires.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="p-2 font-medium sticky left-0 z-10 bg-background whitespace-nowrap">
                  {u.name}
                </td>
                {sortedMatches.map((match) => (
                  <td key={match.id} className="p-1">
                    {renderCell(match.id, u.id)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
