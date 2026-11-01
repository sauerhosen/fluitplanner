"use client";

import { Eye, EyeOff } from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";
import type { Match } from "@/lib/types/domain";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AssignmentCount = { confirmed: number; tentative: number };

type Props = {
  matches: Match[];
  /**
   * Assignments per match. A hidden match can still carry umpires — and
   * "confirm all tentative" still acts on its drafts — so the marker has to
   * say so rather than fold them out of sight.
   */
  countFor?: (matchId: string) => AssignmentCount;
  /** Absent for viewers: the marker then only says what is folded away. */
  onUnhide?: (matchIds: string[]) => void;
  /** Column header (vertical strip) or a row of its own (match-per-row grid). */
  orientation: "column" | "row";
};

/**
 * Stands in for a run of hidden matches in the assignment grid. One marker per
 * run, so hiding a block of fixtures shrinks it to a sliver rather than leaving
 * a gap per match; opening it lists them and brings any back.
 */
export function HiddenMatchesMarker({
  matches,
  onUnhide,
  countFor,
  orientation,
}: Props) {
  const t = useTranslations("polls");
  const format = useFormatter();
  const count = matches.length;
  const totals = matches.reduce(
    (sum, m) => {
      const c = countFor?.(m.id) ?? { confirmed: 0, tentative: 0 };
      return {
        confirmed: sum.confirmed + c.confirmed,
        tentative: sum.tentative + c.tentative,
      };
    },
    { confirmed: 0, tentative: 0 },
  );
  const assignedNote =
    totals.confirmed + totals.tentative > 0
      ? t("hiddenMatchesAssigned", {
          confirmed: totals.confirmed,
          tentative: totals.tentative,
        })
      : null;
  const label = [t("hiddenMatchesCount", { count }), assignedNote]
    .filter(Boolean)
    .join(" · ");

  // Solid for a confirmed umpire, dashed for drafts only — the grid's own
  // vocabulary for confirmed vs tentative.
  const assignedDot =
    totals.confirmed > 0 ? (
      <span
        className="h-1.5 w-1.5 rounded-full bg-primary"
        data-testid="hidden-assigned-dot"
      />
    ) : totals.tentative > 0 ? (
      <span
        className="h-1.5 w-1.5 rounded-full outline-1 outline-dashed outline-primary"
        data-testid="hidden-assigned-dot"
      />
    ) : null;

  function countLabel(matchId: string) {
    const c = countFor?.(matchId);
    if (!c || c.confirmed + c.tentative === 0) return null;
    return c.tentative > 0
      ? `${c.confirmed}/2 (+${c.tentative})`
      : `${c.confirmed}/2`;
  }

  function describe(match: Match) {
    const time = match.start_time
      ? format.dateTime(new Date(match.start_time), {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
      : null;
    return { time, teams: `${match.home_team} – ${match.away_team}` };
  }

  const face =
    orientation === "column" ? (
      <>
        <EyeOff className="h-3.5 w-3.5" />
        <span className="text-[10px] tabular-nums leading-none">{count}</span>
        {assignedDot}
      </>
    ) : (
      <>
        <EyeOff className="h-3.5 w-3.5" />
        <span>{label}</span>
        {assignedDot}
      </>
    );

  const faceClass = cn(
    "flex items-center justify-center rounded text-muted-foreground",
    orientation === "column"
      ? "h-full min-h-14 w-6 flex-col gap-1 py-1"
      : "gap-1.5 px-2 py-1 text-xs",
  );

  if (!onUnhide) {
    return (
      <span
        className={faceClass}
        role="img"
        aria-label={label}
        title={[label, ...matches.map((m) => describe(m).teams)].join("\n")}
        data-testid="hidden-matches-marker"
      >
        {face}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            faceClass,
            "cursor-pointer transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
          )}
          aria-label={label}
          title={label}
          data-testid="hidden-matches-marker"
        >
          {face}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-80">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("hiddenMatchesHint")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {matches.map((match) => {
          const { time, teams } = describe(match);
          const assigned = countLabel(match.id);
          return (
            <DropdownMenuItem
              key={match.id}
              onSelect={() => onUnhide([match.id])}
              data-testid={`unhide-${match.id}`}
            >
              <Eye className="mr-2 h-4 w-4" />
              {time && (
                <span className="tabular-nums text-muted-foreground">
                  {time}
                </span>
              )}
              <span className="truncate">{teams}</span>
              {assigned && (
                <span className="ml-auto pl-2 text-xs tabular-nums text-muted-foreground">
                  {assigned}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
        {count > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => onUnhide(matches.map((m) => m.id))}
              data-testid="unhide-all"
            >
              <Eye className="mr-2 h-4 w-4" />
              {t("showAllHidden")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
