"use client";

import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslations, useFormatter } from "next-intl";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  subMonths,
} from "date-fns";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";

type Props = {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
};

export function DateRangePicker({ value, onChange }: Props) {
  const t = useTranslations("matches");
  const format = useFormatter();
  const [open, setOpen] = useState(false);

  const today = useMemo(() => new Date(), []);

  const presets = useMemo<{ label: string; range: DateRange | undefined }[]>(
    () => [
      {
        label: t("presetThisWeek"),
        range: {
          from: startOfWeek(today, { weekStartsOn: 1 }),
          to: endOfWeek(today, { weekStartsOn: 1 }),
        },
      },
      {
        label: t("presetNextTwoWeeks"),
        range: { from: today, to: addDays(today, 14) },
      },
      {
        label: t("presetThisMonth"),
        range: { from: startOfMonth(today), to: endOfMonth(today) },
      },
      {
        label: t("presetNextTwoMonths"),
        range: { from: today, to: addMonths(today, 2) },
      },
      {
        label: t("presetPastMonth"),
        range: {
          from: startOfMonth(subMonths(today, 1)),
          to: endOfMonth(subMonths(today, 1)),
        },
      },
      { label: t("presetAll"), range: undefined },
    ],
    [today, t],
  );

  function handlePreset(range: DateRange | undefined) {
    onChange(range);
    setOpen(false);
  }

  function handleCalendarSelect(range: DateRange | undefined) {
    onChange(range);
    if (range?.from && range?.to) {
      setOpen(false);
    }
  }

  function formatDate(d: Date) {
    return format.dateTime(d, { month: "short", day: "numeric" });
  }

  const buttonText = value?.from
    ? `${formatDate(value.from)} – ${value.to ? formatDate(value.to) : "..."}`
    : t("presetAll");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label={t("dateRange")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {buttonText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col gap-2 border-b p-3">
          <div className="flex flex-wrap gap-1">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                onClick={() => handlePreset(preset.range)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
        <Calendar
          mode="range"
          selected={value}
          onSelect={handleCalendarSelect}
          numberOfMonths={2}
          defaultMonth={value?.from ?? today}
          weekStartsOn={1}
        />
      </PopoverContent>
    </Popover>
  );
}
