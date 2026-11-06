/**
 * Closed poll days: a planner can close single days of an open poll. A closed
 * day stays on the public poll page, greyed out with the answers already
 * given, but its slots take no more answers; the planner still sees it,
 * answers and all.
 *
 * A day is the Europe/Amsterdam calendar date of a slot's start — the date the
 * club and its umpires think in, whatever timezone the server or browser is in.
 */

import { amsterdamDay } from "@/lib/domain/timezone";

// Re-exported: it is how a slot is mapped to the day a planner closes.
export { amsterdamDay };

/** A real ISO calendar date, e.g. "2026-09-05". */
export function isValidDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(day)
  );
}

/** The slots umpires may still answer: those not on a closed day. */
export function withoutClosedDays<S extends { start_time: string }>(
  slots: S[],
  closedDays: readonly string[],
): S[] {
  if (closedDays.length === 0) return slots;
  const closed = new Set(closedDays);
  return slots.filter((s) => !closed.has(amsterdamDay(s.start_time)));
}

/** The ids of the slots on a closed day: shown to umpires, but read-only. */
export function closedDaySlotIds<S extends { id: string; start_time: string }>(
  slots: S[],
  closedDays: readonly string[],
): string[] {
  if (closedDays.length === 0) return [];
  const closed = new Set(closedDays);
  return slots
    .filter((s) => closed.has(amsterdamDay(s.start_time)))
    .map((s) => s.id);
}
