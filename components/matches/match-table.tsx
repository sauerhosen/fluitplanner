"use client";

import { Fragment, useState } from "react";
import type { MatchWithPoll } from "@/lib/actions/matches";
import { deleteMatch, deleteMatches } from "@/lib/actions/matches";
import Link from "next/link";
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
import { useSelection } from "@/hooks/use-selection";
import { SelectionToolbar } from "@/components/shared/selection-toolbar";

const LEVEL_VARIANTS: Record<number, "default" | "secondary" | "destructive"> =
  {
    1: "secondary",
    2: "default",
    3: "destructive",
  };

function groupByDate(matches: MatchWithPoll[]): Map<string, MatchWithPoll[]> {
  const groups = new Map<string, MatchWithPoll[]>();
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
  toolbarActions,
}: {
  matches: MatchWithPoll[];
  onEdit: (match: MatchWithPoll) => void;
  onDeleted: () => void;
  toolbarActions?: (
    selectedIds: Set<string>,
    clearSelection: () => void,
  ) => React.ReactNode;
}) {
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const groups = groupByDate(matches);
  const t = useTranslations("matches");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const {
    selectedIds,
    toggleSelection,
    toggleAll,
    toggleGroup,
    clearSelection,
    allChecked,
    someChecked,
    isGroupAllSelected,
    isGroupSomeSelected,
  } = useSelection(matches, (m) => m.id);

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

  async function handleBulkDelete() {
    await deleteMatches([...selectedIds]);
    clearSelection();
    onDeleted();
  }

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
        <Inbox className="h-10 w-10" />
        <p>{t("emptyState")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SelectionToolbar
        selectedCount={selectedIds.size}
        onDelete={handleBulkDelete}
        onClearSelection={clearSelection}
      >
        {toolbarActions?.(selectedIds, clearSelection)}
      </SelectionToolbar>
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
              <TableHead>{t("pollHeader")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...groups.entries()].map(([date, dateMatches]) => {
              const collapsed = collapsedDates.has(date);
              const dateMatchIds = dateMatches.map((m) => m.id);

              return (
                <Fragment key={date}>
                  {/* Date group header */}
                  <TableRow
                    className="bg-muted/50 cursor-pointer hover:bg-muted"
                    onClick={() => toggleDate(date)}
                  >
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-default"
                    >
                      <Checkbox
                        checked={
                          isGroupAllSelected(dateMatchIds)
                            ? true
                            : isGroupSomeSelected(dateMatchIds)
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={() => toggleGroup(dateMatchIds)}
                        aria-label={tCommon("selectDateGroup", {
                          date: formatDate(date),
                        })}
                      />
                    </TableCell>
                    <TableCell colSpan={8} className="font-semibold">
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
                          {match.poll ? (
                            <Link
                              href={`/protected/polls/${match.poll.id}`}
                              className="text-sm text-primary hover:underline"
                            >
                              {match.poll.title ?? match.poll.id}
                            </Link>
                          ) : (
                            "—"
                          )}
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
