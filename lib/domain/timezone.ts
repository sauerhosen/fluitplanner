/**
 * Club times are wall-clock times in Europe/Amsterdam; the database stores
 * timestamptz. These helpers derive the correct UTC offset (CET/CEST) for a
 * given local date+time so composed timestamps survive DST transitions.
 */
export function getAmsterdamOffset(dateISO: string, time: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    timeZoneName: "shortOffset",
  });
  // Use a rough UTC guess to resolve the correct DST period
  const rough = new Date(`${dateISO}T${time}:00Z`);
  const parts = fmt.formatToParts(rough);
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  // tzPart is like "GMT+1" or "GMT+2"; convert to "+01:00" / "+02:00"
  const m = tzPart.match(/GMT([+-]\d+)/);
  if (!m) return "+01:00"; // fallback CET
  const hours = parseInt(m[1], 10);
  const sign = hours >= 0 ? "+" : "-";
  return `${sign}${String(Math.abs(hours)).padStart(2, "0")}:00`;
}

/** "2026-09-05" + "08:30" → "2026-09-05T08:30:00+02:00" (Amsterdam wall clock). */
export function composeAmsterdamTimestamp(
  dateISO: string,
  time: string,
): string {
  return `${dateISO}T${time}:00${getAmsterdamOffset(dateISO, time)}`;
}
