"use client";

import { Fragment, useState, useMemo, useCallback, useEffect } from "react";
import { Check, Ban, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  createAssignment,
  deleteAssignment,
  setAssignmentStatus,
  confirmTentativeAssignments,
  clearTentativeAssignments,
} from "@/lib/actions/assignments";
import { mapMatchesToSlots } from "@/lib/domain/match-slot-mapping";
import { stripClubPrefix } from "@/lib/domain/team-names";
import { shortenUmpireName } from "@/lib/domain/umpire-names";
import {
  findConflicts,
  type AssignmentConflict,
} from "@/lib/domain/assignment-conflicts";
import type {
  Match,
  PollSlot,
  AvailabilityResponse,
  Assignment,
  AssignmentStatus,
  RosteredUmpire,
} from "@/lib/types/domain";
import { MatchNoteButton } from "@/components/matches/match-note-button";
import { UmpireNoteButton } from "@/components/umpires/umpire-note-button";
import { useTranslations, useFormatter } from "next-intl";

type Props = {
  pollId: string;
  matches: Match[];
  slots: PollSlot[];
  responses: AvailabilityResponse[];
  assignments: Assignment[];
  umpires: RosteredUmpire[];
  transposed?: boolean;
  /**
   * While on, a click sketches a tentative appointment instead of a real one.
   * Owned by the page so the switch can live in the poll's toolbar row rather
   * than in a strip of its own above the grid.
   */
  tentativeMode?: boolean;
  /** Own club name, stripped from home team labels so columns stay narrow. */
  clubName?: string | null;
  onAssignmentsChange?: (assignments: Assignment[]) => void;
  /** Called after a match note is saved so the parent can refetch. */
  onNoteSaved?: () => void;
  /** Called after an umpire note is saved so the parent can refetch. */
  onUmpireNoteSaved?: () => void;
};

const AVAILABILITY_COLORS: Record<string, string> = {
  yes: "bg-green-100 dark:bg-green-900/30",
  if_need_be: "bg-yellow-100 dark:bg-yellow-900/30",
  no: "bg-red-100 dark:bg-red-900/30",
};

const NO_RESPONSE_COLOR = "bg-muted/50";

/** Dashed icon strokes, so a tentative cell reads as a sketch at a glance. */
const DASHED_STROKE = "[stroke-dasharray:3_2]";

export function AssignmentGrid({
  pollId,
  matches,
  slots,
  responses,
  assignments: initialAssignments,
  umpires,
  transposed = false,
  tentativeMode = false,
  clubName,
  onAssignmentsChange,
  onNoteSaved,
  onUmpireNoteSaved,
}: Props) {
  const [assignments, setAssignments] = useState(initialAssignments);
  const [saving, setSaving] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const t = useTranslations("polls");
  const format = useFormatter();

  useEffect(() => {
    onAssignmentsChange?.(assignments);
  }, [assignments, onAssignmentsChange]);

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

  const statusByKey = useMemo(() => {
    const map = new Map<string, AssignmentStatus>();
    for (const a of assignments) {
      map.set(`${a.match_id}-${a.umpire_id}`, a.status);
    }
    return map;
  }, [assignments]);

  /** Counts split by status: only confirmed ones fill a match's 2 slots. */
  const counts = useMemo(() => {
    const byMatch = new Map<string, { confirmed: number; tentative: number }>();
    const byUmpire = new Map<
      string,
      { confirmed: number; tentative: number }
    >();
    let tentativeTotal = 0;

    for (const a of assignments) {
      const match = byMatch.get(a.match_id) ?? { confirmed: 0, tentative: 0 };
      const umpire = byUmpire.get(a.umpire_id) ?? {
        confirmed: 0,
        tentative: 0,
      };
      match[a.status] += 1;
      umpire[a.status] += 1;
      byMatch.set(a.match_id, match);
      byUmpire.set(a.umpire_id, umpire);
      if (a.status === "tentative") tentativeTotal += 1;
    }

    return { byMatch, byUmpire, tentativeTotal };
  }, [assignments]);

  const matchCount = useCallback(
    (matchId: string) =>
      counts.byMatch.get(matchId) ?? { confirmed: 0, tentative: 0 },
    [counts],
  );

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

  const handleCellClick = useCallback(
    async (matchId: string, umpireId: string, flip: boolean) => {
      const key = `${matchId}-${umpireId}`;
      if (saving || bulkPending) return;

      // The mode decides what a click aims for; alt/shift aims at the other
      // state for one cell without leaving the mode.
      const target: AssignmentStatus =
        tentativeMode !== flip ? "tentative" : "confirmed";
      const current = statusByKey.get(key) ?? null;
      const match = matches.find((m) => m.id === matchId);
      const snapshot = assignments;

      if (current === null) {
        const { confirmed, tentative } = matchCount(matchId);
        if (confirmed + tentative >= 2) {
          toast.warning(t("matchAlreadyHasTwo"));
        }
      }

      setSaving(key);
      try {
        if (current === null) {
          setAssignments((prev) => [
            ...prev,
            {
              id: `temp-${key}`,
              poll_id: pollId,
              match_id: matchId,
              umpire_id: umpireId,
              created_at: new Date().toISOString(),
              organization_id:
                match?.organization_id ??
                initialAssignments[0]?.organization_id ??
                "",
              status: target,
            },
          ]);
          const result = await createAssignment(
            pollId,
            matchId,
            umpireId,
            target,
          );
          setAssignments((prev) =>
            prev.map((a) => (a.id === `temp-${key}` ? result : a)),
          );
        } else if (current === target) {
          // Clicking a cell that is already in the state you are aiming for
          // clears it.
          setAssignments((prev) =>
            prev.filter(
              (a) => !(a.match_id === matchId && a.umpire_id === umpireId),
            ),
          );
          await deleteAssignment(pollId, matchId, umpireId);
        } else {
          setAssignments((prev) =>
            prev.map((a) =>
              a.match_id === matchId && a.umpire_id === umpireId
                ? { ...a, status: target }
                : a,
            ),
          );
          await setAssignmentStatus(pollId, matchId, umpireId, target);
        }
      } catch {
        setAssignments(snapshot);
        toast.error(t("failedToSaveAssignment"));
      } finally {
        setSaving(null);
      }
    },
    [
      saving,
      bulkPending,
      tentativeMode,
      statusByKey,
      matchCount,
      assignments,
      pollId,
      t,
      matches,
      initialAssignments,
    ],
  );

  const handleConfirmAllTentative = useCallback(async () => {
    if (saving || bulkPending) return;
    const snapshot = assignments;
    setBulkPending(true);
    setAssignments((prev) =>
      prev.map((a) =>
        a.status === "tentative" ? { ...a, status: "confirmed" } : a,
      ),
    );
    try {
      const count = await confirmTentativeAssignments(pollId);
      toast.success(t("tentativeConfirmed", { count }));
    } catch {
      setAssignments(snapshot);
      toast.error(t("failedToSaveAssignment"));
    } finally {
      setBulkPending(false);
    }
  }, [saving, bulkPending, assignments, pollId, t]);

  const handleClearTentative = useCallback(async () => {
    if (saving || bulkPending) return;
    const snapshot = assignments;
    setBulkPending(true);
    setAssignments((prev) => prev.filter((a) => a.status !== "tentative"));
    try {
      const count = await clearTentativeAssignments(pollId);
      toast.success(t("tentativeCleared", { count }));
    } catch {
      setAssignments(snapshot);
      toast.error(t("failedToSaveAssignment"));
    } finally {
      setBulkPending(false);
    }
  }, [saving, bulkPending, assignments, pollId, t]);

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
  }, [sortedMatches, format]);

  if (umpires.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {t("noUmpireResponsesYet")}
      </p>
    );
  }

  function renderCell(matchId: string, umpireId: string) {
    const key = `${matchId}-${umpireId}`;
    const status = statusByKey.get(key) ?? null;
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
      status === "confirmed" && !conflict
        ? "ring-2 ring-primary font-bold"
        : "";

    // A dashed outline rather than a coloured ring: the cell background is
    // already carrying availability (green/yellow/red), so the dashes have to
    // do the talking. `ring-*` is a box-shadow and cannot be dashed.
    const tentativeStyle =
      status === "tentative"
        ? "outline-2 outline-dashed outline-primary/70 -outline-offset-2"
        : "";

    const dashedIcon = status === "tentative" ? DASHED_STROKE : "";

    const title = conflict
      ? conflict.severity === "hard"
        ? t("conflictOverlapping")
        : t("warningSameDay")
      : status === "confirmed"
        ? t("assigned")
        : status === "tentative"
          ? t("tentativeCellTitle")
          : undefined;

    return (
      <button
        key={key}
        data-testid={`cell-${key}`}
        data-status={status ?? "none"}
        title={title}
        className={`relative flex h-10 w-full min-w-10 items-center justify-center rounded transition-all ${bgColor} ${conflictBorder || assignedStyle} ${tentativeStyle} ${isSaving ? "opacity-50" : "cursor-pointer hover:opacity-80"}`}
        onClick={(e) =>
          handleCellClick(matchId, umpireId, e.altKey || e.shiftKey)
        }
        disabled={isSaving}
      >
        {status === "confirmed" && !conflict && (
          <Check className="h-4 w-4 text-primary" />
        )}
        {status === "tentative" && !conflict && (
          <Check className={`h-4 w-4 text-primary/60 ${DASHED_STROKE}`} />
        )}
        {/* A conflicted cell shows the conflict icon, dashed while tentative so
            the sketch stays readable under the conflict ring. */}
        {status && conflict?.severity === "hard" && (
          <Ban className={`h-4 w-4 text-red-500 ${dashedIcon}`} />
        )}
        {status && conflict?.severity === "soft" && (
          <AlertTriangle className={`h-4 w-4 text-orange-500 ${dashedIcon}`} />
        )}
      </button>
    );
  }

  /**
   * Assignment progress as a bar rather than a "0/2" pill: across a full poll
   * the pills were the heaviest ink in the header, while empty/half/full reads
   * at a glance. Tentative appointments trail the confirmed fill as a ghost
   * segment, so a fully sketched match still looks unfinished. The exact count
   * stays available as a tooltip.
   */
  function renderCountBar(matchId: string) {
    const { confirmed, tentative } = matchCount(matchId);
    const over = confirmed > 2;
    const label =
      tentative > 0 ? `${confirmed}/2 (+${tentative})` : `${confirmed}/2`;
    const ghost = Math.min(tentative, Math.max(0, 2 - confirmed));
    return (
      <span
        role="img"
        aria-label={label}
        title={label}
        className="mt-1 flex h-[3px] w-full overflow-hidden rounded-full bg-muted"
      >
        <span
          className={`block h-full ${over ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${(Math.min(confirmed, 2) / 2) * 100}%` }}
        />
        <span
          className="block h-full bg-primary/40"
          style={{ width: `${(ghost / 2) * 100}%` }}
        />
      </span>
    );
  }

  function renderCountBadge(matchId: string) {
    const { confirmed, tentative } = matchCount(matchId);
    const variant =
      confirmed === 2 ? "default" : confirmed > 2 ? "destructive" : "secondary";
    return (
      <span className="inline-flex items-center gap-1">
        <Badge variant={variant}>{confirmed}/2</Badge>
        {tentative > 0 && (
          <span
            className="text-[11px] tabular-nums text-muted-foreground"
            title={t("tentativePending", { count: tentative })}
          >
            +{tentative}
          </span>
        )}
      </span>
    );
  }

  /** Per-umpire workload: confirmed, with any sketches trailing it muted. */
  function renderUmpireCount(umpireId: string) {
    const { confirmed, tentative } = counts.byUmpire.get(umpireId) ?? {
      confirmed: 0,
      tentative: 0,
    };
    return (
      <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
        {confirmed}
        {tentative > 0 && (
          <span title={t("tentativePending", { count: tentative })}>
            {" "}
            +{tentative}
          </span>
        )}
      </span>
    );
  }

  /**
   * Only rendered once something tentative exists: an always-present strip was
   * a row of empty space above the grid, and the mode switch itself lives in
   * the page toolbar next to the other grid controls.
   */
  function renderTentativeBar() {
    const tentativeCount = counts.tentativeTotal;
    if (tentativeCount === 0) return null;

    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span
          className="flex items-center gap-1.5"
          data-testid="tentative-summary"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded outline-2 outline-dashed outline-primary/70 -outline-offset-2">
            <Check className={`h-3 w-3 text-primary/60 ${DASHED_STROKE}`} />
          </span>
          {t("tentativeSummary", { count: tentativeCount })}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            data-testid="confirm-tentative"
            disabled={bulkPending}
            onClick={handleConfirmAllTentative}
          >
            {t("confirmAllTentative")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            data-testid="clear-tentative"
            disabled={bulkPending}
            onClick={handleClearTentative}
          >
            {t("clearTentative")}
          </Button>
        </span>
      </div>
    );
  }

  if (!transposed) {
    return (
      <div className="flex flex-col gap-2">
        {renderTentativeBar()}
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
                      <div className="flex items-center gap-1">
                        <span>{u.name}</span>
                        <UmpireNoteButton
                          umpire={u}
                          variant="indicator"
                          onSaved={onUmpireNoteSaved}
                        />
                      </div>
                      {renderUmpireCount(u.id)}
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
                                hour12: false,
                              })}
                            </span>
                          )}
                          <span className="font-medium truncate">
                            {match.home_team} &ndash; {match.away_team}
                          </span>
                          <MatchNoteButton
                            match={match}
                            variant="indicator"
                            onSaved={onNoteSaved}
                          />
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
      {renderTentativeBar()}
      {/* On a phone, vertical scrolling lives in this container rather than the
          page, which is what lets the match header stick: a sticky thead can
          only pin to the scrollport of its own overflow ancestor. From `sm` up
          the cap is lifted, so the grid grows with the page as it always has
          and the header scrolls away with it. */}
      <div className="scrollbar-visible overflow-auto max-h-[70vh] sm:max-h-none pb-2">
        <table className="min-w-full text-sm border-collapse">
          <thead className="sticky top-0 z-20">
            <tr className="bg-background">
              <th
                rowSpan={2}
                className="text-left p-1 sm:p-2 font-medium sticky left-0 z-30 bg-background min-w-24 sm:min-w-32 align-bottom"
              >
                {t("umpireColumnHeader")}
              </th>
              {dateGroups.map((group, gi) => (
                <th
                  key={group.date}
                  colSpan={group.matches.length}
                  className={`bg-background p-1 pb-0 text-center font-semibold text-xs capitalize ${gi > 0 ? "border-l-2 border-border" : ""}`}
                >
                  {group.label}
                </th>
              ))}
            </tr>
            <tr className="bg-background">
              {sortedMatches.map((match, i) => {
                const prevMatch = sortedMatches[i - 1];
                const showBorder =
                  i > 0 && (!prevMatch || prevMatch.date !== match.date);
                return (
                  <th
                    key={match.id}
                    className={`relative bg-background p-1 sm:p-2 pt-0 text-center font-medium whitespace-nowrap min-w-14 sm:min-w-24 ${showBorder ? "border-l-2 border-border" : ""}`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      {match.start_time && (
                        <span className="text-[11px] tabular-nums text-muted-foreground">
                          {format.dateTime(new Date(match.start_time), {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                      )}
                      <span className="flex w-full max-w-12 sm:max-w-none flex-col items-center text-[10px] sm:text-[11px] leading-tight">
                        <span className="w-full truncate">
                          {stripClubPrefix(match.home_team, clubName)}
                        </span>
                        <span className="w-full truncate text-muted-foreground">
                          {match.away_team}
                        </span>
                      </span>
                      {/* Absolute so a note never adds a row: an in-flow icon made
                          noted columns taller and knocked their fill bar, and the
                          cells beneath it, out of line with every other column. */}
                      <MatchNoteButton
                        match={match}
                        variant="indicator"
                        onSaved={onNoteSaved}
                        className="absolute right-0 top-0"
                      />
                      {renderCountBar(match.id)}
                    </div>
                  </th>
                );
              })}
            </tr>
            {/* A collapsed border on a sticky header is dropped while it is
                pinned, so the header's bottom edge is a row of its own. */}
            <tr className="bg-background">
              <td
                colSpan={1 + sortedMatches.length}
                className="h-px bg-border p-0"
              />
            </tr>
          </thead>
          <tbody>
            {umpires.map((u) => (
              <tr key={u.id} className="border-b">
                <td className="p-1 sm:p-2 font-medium sticky left-0 z-10 bg-background whitespace-nowrap">
                  <div className="flex items-center gap-1 sm:gap-2">
                    {/* The full name is what the column is widest for, so on a
                        phone the surname collapses to initials; both are
                        rendered and swapped by breakpoint to keep one markup
                        path (and the full name searchable by the browser). */}
                    <span className="sm:hidden" title={u.name}>
                      {shortenUmpireName(u.name)}
                    </span>
                    <span className="hidden sm:inline">{u.name}</span>
                    {renderUmpireCount(u.id)}
                    <UmpireNoteButton
                      umpire={u}
                      variant="indicator"
                      onSaved={onUmpireNoteSaved}
                    />
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
