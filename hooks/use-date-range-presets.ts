"use client";

import { useMemo } from "react";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  subMonths,
} from "date-fns";
import { useTranslations } from "next-intl";
import type { DateRange } from "react-day-picker";

export type DateRangePreset = {
  label: string;
  range: DateRange | undefined;
};

/**
 * The date shortcuts offered alongside the calendar.
 *
 * Shared, because a phone gets the presets on their own: the two-month
 * calendar the picker opens with does not fit a dropdown, and the shortcuts
 * are what a planner reaches for there anyway.
 */
export function useDateRangePresets(): DateRangePreset[] {
  const t = useTranslations("common");
  const today = useMemo(() => new Date(), []);

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
}
