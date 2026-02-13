"use client";

import { Fragment, useState } from "react";
import type { Match } from "@/lib/types/domain";
import { deleteMatch } from "@/lib/actions/matches";
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

const LEVEL_LABELS: Record<number, string> = {
  1: "Any",
  2: "Experienced",
  3: "Top",
};

const LEVEL_VARIANTS: Record<number, "default" | "secondary" | "destructive"> =
  {
    1: "secondary",
    2: "default",
    3: "destructive",
  };

function formatTime(startTime: string | null): string {
  if (!startTime) return "—";
  const date = new Date(startTime);
  return date.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

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
  const groups = groupByDate(matches);

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

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
        <Inbox className="h-10 w-10" />
        <p>No matches yet. Upload a schedule or add a match manually.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Time</TableHead>
            <TableHead>Home</TableHead>
            <TableHead>Away</TableHead>
            <TableHead>Field</TableHead>
            <TableHead>Venue</TableHead>
            <TableHead className="w-32">Level</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...groups.entries()].map(([date, dateMatches]) => {
            const collapsed = collapsedDates.has(date);
            return (
              <Fragment key={date}>
                {/* Date group header */}
                <TableRow
                  className="bg-muted/50 cursor-pointer hover:bg-muted"
                  onClick={() => toggleDate(date)}
                >
                  <TableCell colSpan={7} className="font-semibold">
                    <div className="flex items-center gap-2">
                      {collapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                      {formatDate(date)}
                      <span className="text-muted-foreground font-normal text-sm">
                        ({dateMatches.length} match
                        {dateMatches.length !== 1 ? "es" : ""})
                      </span>
                    </div>
                  </TableCell>
                </TableRow>

                {/* Match rows */}
                {!collapsed &&
                  dateMatches.map((match) => (
                    <TableRow key={match.id}>
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
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(match.id)}
                              disabled={deletingId === match.id}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
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
  );
}
