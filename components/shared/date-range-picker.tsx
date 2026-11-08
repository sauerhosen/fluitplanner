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
import { useMemo, useState, useSyncExternalStore } from "react";
import { useDateRangePresets } from "@/hooks/use-date-range-presets";
import type { DateRange } from "react-day-picker";

const subscribeToNothing = () => () => {};

/**
 * A filter offered beside the date presets that is not a range of dates, such
 * as a poll's open days. While active it labels the button; picking any date
 * range is the page's cue to switch it off.
 */
export type DayFilterOption = {
  label: string;
  active: boolean;
  onSelect: () => void;
};

type Props = {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  dayFilter?: DayFilterOption;
};

export function DateRangePicker({ value, onChange, dayFilter }: Props) {
  const t = useTranslations("common");
  const format = useFormatter();
  const [open, setOpen] = useState(false);

  const today = useMemo(() => new Date(), []);
  // The calendar yields local midnights, so the label belongs in the browser's
  // own zone: in the app's Amsterdam zone it slips a day east of Amsterdam. The
  // server cannot know that zone, so the server render and hydration keep the
  // app zone and the browser relabels right after.
  const browserTimeZone = useSyncExternalStore(
    subscribeToNothing,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => undefined,
  );
  const presets = useDateRangePresets();

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
    return format.dateTime(d, {
      ...(browserTimeZone && { timeZone: browserTimeZone }),
      month: "short",
      day: "numeric",
    });
  }

  const buttonText = dayFilter?.active
    ? dayFilter.label
    : value?.from
      ? value.to
        ? `${formatDate(value.from)} – ${formatDate(value.to)}`
        : t("rangeFrom", { date: formatDate(value.from) })
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
            {dayFilter && (
              <Button
                variant={dayFilter.active ? "secondary" : "ghost"}
                size="sm"
                aria-pressed={dayFilter.active}
                onClick={() => {
                  dayFilter.onSelect();
                  setOpen(false);
                }}
              >
                {dayFilter.label}
              </Button>
            )}
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
          selected={dayFilter?.active ? undefined : value}
          onSelect={handleCalendarSelect}
          numberOfMonths={2}
          defaultMonth={value?.from ?? today}
          weekStartsOn={1}
        />
      </PopoverContent>
    </Popover>
  );
}
