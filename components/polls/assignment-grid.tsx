"use client";

import { Fragment, useState, useMemo, useCallback } from "react";
import { Check, Ban, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
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
import { useTranslations, useFormatter } from "next-intl";

type Props = {
  pollId: string;
  matches: Match[];
  slots: PollSlot[];
  responses: AvailabilityResponse[];
  assignments: Assignment[];
  umpires: Umpire[];
  transposed?: boolean;
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
  transposed = false,
}: Props) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [saving, setSaving] = useState<string | null>(null);
  const t = useTranslations("polls");
  const format = useFormatter();

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

  const umpireAssignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of assignments) {
      counts.set(a.umpire_id, (counts.get(a.umpire_id) ?? 0) + 1);
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
        toast.warning(t("matchAlreadyHasTwo"));
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
        toast.error(t("failedToSaveAssignment"));
      } finally {
        setSaving(null);
      }
    },
    [saving, assignmentSet, assignmentCounts, pollId, setAssignments, t],
  );

  const sortedMatches = useMemo(
    () =>
      [...matches].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.start_time ?? "").localeCompare(b.start_time ?? "");
      }),
    [matches],
  );

  const dateGroups = useMemo(() => {
    const groups: {
      date: string;
      label: string;
      matches: typeof sortedMatches;
    }[] = [];
    for (const match of sortedMatches) {
      const last = groups[groups.length - 1];
      if (last && last.date === match.date) {
        last.matches.push(match);
      } else {
        groups.push({
          date: match.date,
          label: format.dateTime(new Date(match.date + "T12:00:00"), {
            weekday: "short",
            day: "numeric",
            month: "short",
          }),
          matches: [match],
        });
      }
    }
    return groups;
  }, [sortedMatches]);

  if (umpires.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {t("noUmpireResponsesYet")}
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
        ? t("conflictOverlapping")
        : t("warningSameDay")
      : isAssigned
        ? t("assigned")
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
        <div className="overflow-auto max-h-[70vh] pb-2">
          <table className="min-w-full text-sm border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className="bg-background">
                <th className="text-left p-2 font-medium sticky left-0 z-30 bg-background max-w-[40vw]">
                  {t("matchColumnHeader")}
                </th>
                <th className="p-2 text-center font-medium min-w-12 bg-background" />
                {umpires.map((u) => (
                  <th
                    key={u.id}
                    className="p-2 text-center font-medium whitespace-nowrap min-w-16 bg-background"
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{u.name}</span>
                      <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                        {umpireAssignmentCounts.get(u.id) ?? 0}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
              <tr className="bg-background">
                <td
                  colSpan={2 + umpires.length}
                  className="h-px bg-border p-0"
                />
              </tr>
            </thead>
            <tbody>
              {dateGroups.map((group) => (
                <Fragment key={group.date}>
                  <tr>
                    <td className="pt-4 pb-1 px-2 bg-background sticky left-0 z-10">
                      <span className="text-sm font-semibold capitalize whitespace-nowrap">
                        {group.label}
                      </span>
                    </td>
                    <td
                      colSpan={1 + umpires.length}
                      className="pt-4 pb-1 bg-background align-bottom"
                    >
                      <div className="h-px bg-border" />
                    </td>
                  </tr>
                  {group.matches.map((match) => (
                    <tr key={match.id} className="border-b border-border/50">
                      <td className="py-1.5 px-2 sticky left-0 z-10 bg-background max-w-[40vw]">
                        <div className="flex items-baseline gap-2">
                          {match.start_time && (
                            <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                              {format.dateTime(new Date(match.start_time), {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          )}
                          <span className="font-medium truncate">
                            {match.home_team} &ndash; {match.away_team}
                          </span>
                        </div>
                      </td>
                      <td className="py-1.5 px-1 text-center">
                        {renderCountBadge(match.id)}
                      </td>
                      {umpires.map((u) => (
                        <td key={u.id} className="p-1">
                          {renderCell(match.id, u.id)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="scrollbar-visible overflow-x-auto pb-2">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr>
              <th
                rowSpan={2}
                className="text-left p-2 font-medium sticky left-0 z-10 bg-background min-w-32 align-bottom"
              >
                {t("umpireColumnHeader")}
              </th>
              {dateGroups.map((group, gi) => (
                <th
                  key={group.date}
                  colSpan={group.matches.length}
                  className={`p-1 pb-0 text-center font-semibold text-xs capitalize ${gi > 0 ? "border-l-2 border-border" : ""}`}
                >
                  {group.label}
                </th>
              ))}
            </tr>
            <tr>
              {sortedMatches.map((match, i) => {
                const prevMatch = sortedMatches[i - 1];
                const showBorder =
                  i > 0 && (!prevMatch || prevMatch.date !== match.date);
                return (
                  <th
                    key={match.id}
                    className={`p-2 pt-0 text-center font-medium whitespace-nowrap min-w-24 ${showBorder ? "border-l-2 border-border" : ""}`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      {match.start_time && (
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {format.dateTime(new Date(match.start_time), {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                      <span className="text-[11px] leading-tight">
                        {match.home_team} &ndash; {match.away_team}
                      </span>
                      {renderCountBadge(match.id)}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {umpires.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="p-2 font-medium sticky left-0 z-10 bg-background whitespace-nowrap">
                  <div className="flex items-baseline gap-2">
                    <span>{u.name}</span>
                    <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
                      {umpireAssignmentCounts.get(u.id) ?? 0}
                    </span>
                  </div>
                </td>
                {sortedMatches.map((match, i) => {
                  const prevMatch = sortedMatches[i - 1];
                  const showBorder =
                    i > 0 && (!prevMatch || prevMatch.date !== match.date);
                  return (
                    <td
                      key={match.id}
                      className={`p-1 ${showBorder ? "border-l-2 border-border" : ""}`}
                    >
                      {renderCell(match.id, u.id)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
