/**
 * Club times are wall-clock times in Europe/Amsterdam; the database stores
 * timestamptz. These helpers derive the correct UTC offset (CET/CEST) for a
 * given local date+time so composed timestamps survive DST transitions.
 */

const OFFSET_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Amsterdam",
  timeZoneName: "shortOffset",
});

/** Amsterdam UTC offset in minutes at a given instant. */
function offsetMinutesAt(instant: Date): number {
  const tzPart =
    OFFSET_FORMAT.formatToParts(instant).find((p) => p.type === "timeZoneName")
      ?.value ?? "";
  // tzPart is like "GMT+1", "GMT+2", or in general "GMT+5:30"
  const m = tzPart.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!m) return 60; // fallback CET
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (parseInt(m[2], 10) * 60 + parseInt(m[3] ?? "0", 10));
}

function formatOffset(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const min = String(abs % 60).padStart(2, "0");
  return `${sign}${h}:${min}`;
}

/**
 * Resolve the offset for a wall-clock time by checking whether a candidate
 * offset maps the wall time to an instant at which that offset actually
 * holds (a fixed point). A first guess that misses is corrected once; around
 * DST transitions that second check settles on the right side.
 *
 * Edge windows: a spring-forward wall time that does not exist gets the
 * pre-transition offset (so it lands just after the jump, like most timezone
 * libraries); a fall-back wall time that occurs twice resolves to whichever
 * side the initial guess finds — for Amsterdam that is the later (CET)
 * occurrence. Both windows are 02:00–02:59 at night, where no hockey match
 * ever starts.
 */
export function getAmsterdamOffset(dateISO: string, time: string): string {
  const naiveUtcMs = new Date(`${dateISO}T${time}:00Z`).getTime();

  const guess = offsetMinutesAt(new Date(naiveUtcMs));
  if (offsetMinutesAt(new Date(naiveUtcMs - guess * 60_000)) === guess) {
    return formatOffset(guess);
  }
  const second = offsetMinutesAt(new Date(naiveUtcMs - guess * 60_000));
  if (offsetMinutesAt(new Date(naiveUtcMs - second * 60_000)) === second) {
    return formatOffset(second);
  }
  // No fixed point: the wall time falls in the spring-forward gap. `second`
  // is the offset just before the transition.
  return formatOffset(second);
}

/** "2026-09-05" + "08:30" → "2026-09-05T08:30:00+02:00" (Amsterdam wall clock). */
export function composeAmsterdamTimestamp(
  dateISO: string,
  time: string,
): string {
  return `${dateISO}T${time}:00${getAmsterdamOffset(dateISO, time)}`;
}
