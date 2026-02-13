import type { ManagedTeam } from "@/lib/types/domain";
import type { RawRow, ParseResult, ParsedMatch, MapperOptions } from "./types";

function parseDutchDate(dateStr: string): string | null {
  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function parseTime(dateISO: string, timeStr: string): string | null {
  if (!timeStr || !timeStr.trim()) return null;
  return `${dateISO}T${timeStr.trim()}:00`;
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

    // Filter by managed teams
    const managedTeam = teamMap.get(homeTeam);
    if (!managedTeam) {
      skippedCount++;
      continue;
    }

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
      required_level: managedTeam.required_level,
    });
  }

  return { matches, skippedCount, errors };
}
