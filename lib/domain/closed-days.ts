/**
 * Closed poll days: a planner can close single days of an open poll. A closed
 * day drops off the public poll page and its slots take no more answers; the
 * planner still sees it, answers and all.
 *
 * A day is the Europe/Amsterdam calendar date of a slot's start — the date the
 * club and its umpires think in, whatever timezone the server or browser is in.
 */

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "2026-09-05T22:30:00Z" → "2026-09-06" (00:30 in Amsterdam). */
export function amsterdamDay(iso: string): string {
  return DAY_FORMAT.format(new Date(iso));
}

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
