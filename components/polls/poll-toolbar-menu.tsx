"use client";

import {
  SlidersHorizontal,
  CalendarIcon,
  PencilLine,
  ArrowRightLeft,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDateRangePresets } from "@/hooks/use-date-range-presets";
import { useIsPlanner } from "@/components/shared/role-provider";
import { ExportDropdown } from "./export-dropdown";
import { useTranslations } from "next-intl";
import type {
  Match,
  PollSlot,
  AvailabilityResponse,
  Assignment,
  Umpire,
} from "@/lib/types/domain";

type Props = {
  pollTitle: string;
  slots: PollSlot[];
  matches: Match[];
  responses: AvailabilityResponse[];
  assignments: Assignment[];
  umpires: Umpire[];
  activeTab: string;
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  tentativeMode: boolean;
  onTentativeModeChange: (next: boolean) => void;
  onSwapAxes: () => void;
  className?: string;
};

/**
 * The toolbar's tools, folded into one button.
 *
 * Side by side they need more width than a phone has, and the tabs beside them
 * are what you reach for most — so below `sm` the tools move in here and the
 * tabs keep the row. The date range arrives as its presets alone: the picker's
 * two-month calendar has nowhere to open on a phone.
 */
export function PollToolbarMenu({
  pollTitle,
  slots,
  matches,
  responses,
  assignments,
  umpires,
  activeTab,
  dateRange,
  onDateRangeChange,
  tentativeMode,
  onTentativeModeChange,
  onSwapAxes,
  className,
}: Props) {
  const t = useTranslations("polls");
  const tCommon = useTranslations("common");
  const presets = useDateRangePresets();
  // Tentative mode only means something to someone who can place appointments.
  const canEdit = useIsPlanner();

  const activePresetLabel = presets.find((preset) =>
    preset.range?.from
      ? dateRange?.from?.getTime() === preset.range.from.getTime() &&
        dateRange?.to?.getTime() === preset.range.to?.getTime()
      : !dateRange?.from,
  )?.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={className}
          aria-label={t("toolsMenu")}
          data-testid="poll-tools-menu"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger inset>
            <CalendarIcon className="mr-2 h-4 w-4" />
            {tCommon("dateRange")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {presets.map((preset) => (
              <DropdownMenuCheckboxItem
                key={preset.label}
                checked={preset.label === activePresetLabel}
                onCheckedChange={() => onDateRangeChange(preset.range)}
              >
                {preset.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <ExportDropdown
          variant="menu"
          pollTitle={pollTitle}
          slots={slots}
          matches={matches}
          responses={responses}
          assignments={assignments}
          umpires={umpires}
          activeTab={activeTab}
        />

        {activeTab === "assignments" && (
          <>
            <DropdownMenuSeparator />
            {canEdit && (
              <DropdownMenuCheckboxItem
                checked={tentativeMode}
                onCheckedChange={onTentativeModeChange}
                data-testid="tentative-mode-menu-item"
              >
                <PencilLine className="mr-2 h-4 w-4" />
                {t("tentativeMode")}
              </DropdownMenuCheckboxItem>
            )}
            <DropdownMenuItem inset onClick={onSwapAxes}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              {t("swapAxes")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
