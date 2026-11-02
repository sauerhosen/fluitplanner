"use client";

import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

type Props = {
  umpires: { id: string; name: string }[];
  /**
   * Umpires the grid is narrowed to, already resolved against the roster by
   * the page; empty shows everyone.
   */
  focusedUmpireIds: string[];
  onFocusedUmpireIdsChange: (umpireIds: string[]) => void;
  hideSilentUmpires: boolean;
  onHideSilentUmpiresChange: (next: boolean) => void;
  className?: string;
};

/**
 * Which umpires the assignment grid shows: a few picked ones, everyone, or only those who
 * answered on the days in view. Lives in the grid's corner cell, on the thing
 * it changes, rather than in the page toolbar.
 *
 * Picking umpires is for the screenshot a planner pastes into a message to
 * them. Filtering happens on the page, not in the grid: counts, conflicts and
 * fill bars keep counting the whole roster, so a narrowed grid still tells the
 * truth about how full a match is.
 */
export function UmpireFilterMenu({
  umpires,
  focusedUmpireIds,
  onFocusedUmpireIdsChange,
  hideSilentUmpires,
  onHideSilentUmpiresChange,
  className,
}: Props) {
  const t = useTranslations("polls");
  const picked = new Set(focusedUmpireIds);
  // Picking umpires overrides the responders filter, so it does not count as
  // an active filter while it has no effect.
  const activeCount = picked.size > 0 ? picked.size : hideSilentUmpires ? 1 : 0;

  function toggle(umpireId: string, on: boolean) {
    onFocusedUmpireIdsChange(
      on
        ? [...focusedUmpireIds, umpireId]
        : focusedUmpireIds.filter((id) => id !== umpireId),
    );
  }

  // Keep the menu open, so several umpires can be picked in one go.
  const stayOpen = (e: Event) => e.preventDefault();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 gap-1.5 px-2 text-xs",
            activeCount > 0 && "border-primary text-primary",
            className,
          )}
          title={t("umpireFilterHint")}
          data-testid="umpire-filter-menu"
        >
          {t("umpireFilter")}
          <Filter className="h-3 w-3" />
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground tabular-nums">
              {activeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {/* A club's roster outgrows the viewport well before it outgrows the
            poll, so the list scrolls rather than running off the screen. */}
        {/* overflow-x-hidden: the separator's -mx-1 bleed would otherwise
            give the list a horizontal scrollbar. */}
        <div className="max-h-[50vh] overflow-x-hidden overflow-y-auto">
          <DropdownMenuCheckboxItem
            checked={picked.size === 0}
            onCheckedChange={() => onFocusedUmpireIdsChange([])}
            onSelect={stayOpen}
            data-testid="all-umpires"
          >
            {t("allUmpires")}
          </DropdownMenuCheckboxItem>
          {umpires.length > 0 && <DropdownMenuSeparator />}
          {umpires.map((u) => (
            <DropdownMenuCheckboxItem
              key={u.id}
              checked={picked.has(u.id)}
              onCheckedChange={(on) => toggle(u.id, on === true)}
              onSelect={stayOpen}
            >
              {u.name}
            </DropdownMenuCheckboxItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={hideSilentUmpires}
          onCheckedChange={(next) => onHideSilentUmpiresChange(next === true)}
          onSelect={stayOpen}
          disabled={picked.size > 0}
          title={t("hideSilentUmpiresHint")}
          data-testid="hide-silent-umpires-toggle"
        >
          {t("hideSilentUmpires")}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
