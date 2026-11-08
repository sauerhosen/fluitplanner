"use client";

import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDateRangePresets } from "@/hooks/use-date-range-presets";
import { useTranslations } from "next-intl";
import type { DayFilterOption } from "@/components/shared/date-range-picker";

type Props = {
  dateRange: DateRange | undefined;
  onDateRangeChange: (range: DateRange | undefined) => void;
  dayFilter?: DayFilterOption;
  className?: string;
};

/**
 * The date range as its presets alone, for a phone: the picker's two-month
 * calendar has nowhere to open on a narrow screen.
 */
export function DateRangeMenu({
  dateRange,
  onDateRangeChange,
  dayFilter,
  className,
}: Props) {
  const tCommon = useTranslations("common");
  const presets = useDateRangePresets();

  const activePresetLabel = dayFilter?.active
    ? undefined
    : presets.find((preset) =>
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
          aria-label={tCommon("dateRange")}
          data-testid="date-range-menu"
        >
          <CalendarIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {dayFilter && (
          <DropdownMenuCheckboxItem
            checked={dayFilter.active}
            onCheckedChange={dayFilter.onSelect}
          >
            {dayFilter.label}
          </DropdownMenuCheckboxItem>
        )}
        {presets.map((preset) => (
          <DropdownMenuCheckboxItem
            key={preset.label}
            checked={preset.label === activePresetLabel}
            onCheckedChange={() => onDateRangeChange(preset.range)}
          >
            {preset.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
