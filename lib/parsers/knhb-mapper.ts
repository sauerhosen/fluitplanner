import type { ManagedTeam } from "@/lib/types/domain";
import type { RawRow, ParseResult, ParsedMatch, MapperOptions } from "./types";

export function extractHomeTeams(rows: RawRow[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of rows) {
    const name = (row["Thuis team"] ?? "").trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

function parseDutchDate(dateStr: string): string | null {
  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function getAmsterdamOffset(dateISO: string, time: string): string {
  // Build a Date that represents the given local time in Europe/Amsterdam,
  // then derive the UTC offset so we can store it correctly in timestamptz.
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

function parseTime(dateISO: string, timeStr: string): string | null {
  if (!timeStr || !timeStr.trim()) return null;
  const time = timeStr.trim();
  const offset = getAmsterdamOffset(dateISO, time);
  return `${dateISO}T${time}:00${offset}`;
}

export function mapKNHBRows(
  rows: RawRow[],
  options: MapperOptions,
): ParseResult {
  const teamMap = new Map<string, ManagedTeam>();
  for (const t of options.managedTeams) {
    teamMap.set(t.name, t);
  }

  const matches: ParsedMatch[] = [];
  const errors: string[] = [];
  let skippedCount = 0;

  // Determine if we're using selectedTeams or managedTeams for filtering
  const useSelectedTeams = options.selectedTeams != null;
  const selectedSet = useSelectedTeams ? new Set(options.selectedTeams) : null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const homeTeam = (row["Thuis team"] ?? "").trim();
    const awayTeam = (row["Tegenstander"] ?? "").trim();
    const datumRaw = (row["Datum"] ?? "").trim();

    // Validate required fields first
    if (!homeTeam) {
      errors.push(`Row ${i + 1}: missing home team`);
      continue;
    }
    if (!datumRaw) {
      errors.push(`Row ${i + 1}: missing date`);
      continue;
    }
    if (!awayTeam) {
      errors.push(`Row ${i + 1}: missing away team`);
      continue;
    }

    // Filter by selected teams or managed teams
    if (useSelectedTeams) {
      if (!selectedSet!.has(homeTeam)) {
        skippedCount++;
        continue;
      }
    } else {
      if (!teamMap.has(homeTeam)) {
        skippedCount++;
        continue;
      }
    }

    // Get required_level from managed team if available, otherwise default to 1
    const managedTeam = teamMap.get(homeTeam);
    const requiredLevel = managedTeam?.required_level ?? 1;

    const dateISO = parseDutchDate(datumRaw);
    if (!dateISO) {
      errors.push(`Row ${i + 1}: invalid date format "${datumRaw}"`);
      continue;
    }

    const timeRaw = (row["Begintijd"] ?? "").trim();
    const startTime = parseTime(dateISO, timeRaw);
    const venue = (row["Locatie"] ?? "").trim() || null;
    const field = (row["Veld"] ?? "").trim() || null;

    matches.push({
      date: dateISO,
      start_time: startTime,
      home_team: homeTeam,
      away_team: awayTeam,
      venue,
      field,
      competition: null,
      required_level: requiredLevel,
    });
  }

  return { matches, skippedCount, errors };
}
