"use client";

import { useMemo } from "react";
import {
  startOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  format,
} from "date-fns";
import { useTranslations } from "next-intl";
import type { DateRange } from "react-day-picker";

export type DateRangePreset = {
  label: string;
  range: DateRange | undefined;
};

/**
 * A test for `yyyy-MM-dd` days against a picked range, bounds formatted once.
 * No range means every day; a range without an end is open-ended (the
 * "upcoming" preset), not a single day.
 */
export function dayRangePredicate(
  range: DateRange | undefined,
): (day: string) => boolean {
  if (!range?.from) return () => true;
  const from = format(range.from, "yyyy-MM-dd");
  const to = range.to ? format(range.to, "yyyy-MM-dd") : null;
  return (day) => day >= from && (to === null || day <= to);
}

/**
 * The date shortcuts offered alongside the calendar.
 *
 * Shared, because a phone gets the presets on their own: the two-month
 * calendar the picker opens with does not fit a dropdown, and the shortcuts
 * are what a planner reaches for there anyway.
 */
export function useDateRangePresets(): DateRangePreset[] {
  const t = useTranslations("common");
  // Midnight, not "now": the picker and the phone's tools menu each hold their
  // own instance, and a range set in one is matched against the other's
  // presets. Two `new Date()` calls milliseconds apart would never compare
  // equal, leaving the menu unable to show which preset is active.
  const today = useMemo(() => startOfDay(new Date()), []);

  return useMemo(
    () => [
      {
        label: t("presetThisWeek"),
        range: {
          from: startOfWeek(today, { weekStartsOn: 1 }),
          to: endOfWeek(today, { weekStartsOn: 1 }),
        },
      },
      {
        label: t("presetThisMonth"),
        range: { from: startOfMonth(today), to: endOfMonth(today) },
      },
      {
        // Open-ended: no `to` means "and everything after". The calendar
        // never yields that shape itself (a first click sets both ends).
        label: t("presetUpcoming"),
        range: { from: today, to: undefined },
      },
      { label: t("presetAll"), range: undefined },
    ],
    [today, t],
  );
}
