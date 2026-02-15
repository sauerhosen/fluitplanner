"use client";

import { Fragment, useState } from "react";
import type { Match } from "@/lib/types/domain";
import { deleteMatch, deleteMatches } from "@/lib/actions/matches";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";

const LEVEL_VARIANTS: Record<number, "default" | "secondary" | "destructive"> =
  {
    1: "secondary",
    2: "default",
    3: "destructive",
  };

function groupByDate(matches: Match[]): Map<string, Match[]> {
  const groups = new Map<string, Match[]>();
  for (const match of matches) {
    const group = groups.get(match.date) ?? [];
    group.push(match);
    groups.set(match.date, group);
  }
  return groups;
}

export function MatchTable({
  matches,
  onEdit,
  onDeleted,
}: {
  matches: Match[];
  onEdit: (match: Match) => void;
  onDeleted: () => void;
}) {
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const groups = groupByDate(matches);
  const t = useTranslations("matches");
  const tCommon = useTranslations("common");
  const format = useFormatter();

  function formatTime(startTime: string | null): string {
    if (!startTime) return "—";
    return format.dateTime(new Date(startTime), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function formatDate(dateStr: string): string {
    return format.dateTime(new Date(dateStr + "T00:00:00"), {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  const LEVEL_LABELS: Record<number, string> = {
    1: t("levelLabelAny"),
    2: t("levelLabelExperienced"),
    3: t("levelLabelTop"),
  };

  function toggleDate(date: string) {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteMatch(id);
      onDeleted();
    } finally {
      setDeletingId(null);
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === matches.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(matches.map((m) => m.id)));
    }
  }

  async function handleBulkDelete() {
    if (!confirm(tCommon("bulkDeleteConfirm", { count: selectedIds.size })))
      return;
    setBulkDeleting(true);
    try {
      await deleteMatches([...selectedIds]);
      setSelectedIds(new Set());
      onDeleted();
    } finally {
      setBulkDeleting(false);
    }
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
        <Inbox className="h-10 w-10" />
        <p>{t("emptyState")}</p>
      </div>
    );
  }

  const allChecked = selectedIds.size === matches.length;
  const someChecked = selectedIds.size > 0 && !allChecked;

  return (
    <div className="flex flex-col gap-3">
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2">
          <span className="text-sm font-medium">
            {tCommon("selectedCount", { count: selectedIds.size })}
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {bulkDeleting ? tCommon("deleting") : tCommon("deleteSelected")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            {tCommon("clearSelection")}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allChecked ? true : someChecked ? "indeterminate" : false
                  }
                  onCheckedChange={toggleAll}
                  aria-label={tCommon("selectAll")}
                />
              </TableHead>
              <TableHead className="w-20">{t("timeHeader")}</TableHead>
              <TableHead>{t("homeHeader")}</TableHead>
              <TableHead>{t("awayHeader")}</TableHead>
              <TableHead>{t("fieldHeader")}</TableHead>
              <TableHead>{t("venueHeader")}</TableHead>
              <TableHead className="w-32">{t("levelHeader")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...groups.entries()].map(([date, dateMatches]) => {
              const collapsed = collapsedDates.has(date);
              const dateMatchIds = dateMatches.map((m) => m.id);
              const allDateSelected = dateMatchIds.every((id) =>
                selectedIds.has(id),
              );
              const someDateSelected =
                dateMatchIds.some((id) => selectedIds.has(id)) &&
                !allDateSelected;

              function toggleDateSelection(e: React.MouseEvent) {
                e.stopPropagation();
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (allDateSelected) {
                    dateMatchIds.forEach((id) => next.delete(id));
                  } else {
                    dateMatchIds.forEach((id) => next.add(id));
                  }
                  return next;
                });
              }

              return (
                <Fragment key={date}>
                  {/* Date group header */}
                  <TableRow
                    className="bg-muted/50 cursor-pointer hover:bg-muted"
                    onClick={() => toggleDate(date)}
                  >
                    <TableCell
                      onClick={toggleDateSelection}
                      className="cursor-pointer"
                    >
                      <Checkbox
                        checked={
                          allDateSelected
                            ? true
                            : someDateSelected
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={() => {}}
                        aria-label={tCommon("selectAll")}
                      />
                    </TableCell>
                    <TableCell colSpan={7} className="font-semibold">
                      <div className="flex items-center gap-2">
                        {collapsed ? (
                          <ChevronRight className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        {formatDate(date)}
                        <span className="text-muted-foreground font-normal text-sm">
                          ({t("matchCount", { count: dateMatches.length })})
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Match rows */}
                  {!collapsed &&
                    dateMatches.map((match) => (
                      <TableRow
                        key={match.id}
                        data-selected={selectedIds.has(match.id) || undefined}
                        className="data-[selected]:bg-primary/5"
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(match.id)}
                            onCheckedChange={() => toggleSelection(match.id)}
                            aria-label={`${match.home_team} - ${match.away_team}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono">
                          {formatTime(match.start_time)}
                        </TableCell>
                        <TableCell>{match.home_team}</TableCell>
                        <TableCell>{match.away_team}</TableCell>
                        <TableCell>{match.field ?? "—"}</TableCell>
                        <TableCell>{match.venue ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={LEVEL_VARIANTS[match.required_level]}>
                            {match.required_level} —{" "}
                            {LEVEL_LABELS[match.required_level]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => onEdit(match)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                {t("edit")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(match.id)}
                                disabled={deletingId === match.id}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {tCommon("delete")}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
