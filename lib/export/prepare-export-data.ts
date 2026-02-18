import type {
  Match,
  PollSlot,
  AvailabilityResponse,
  Assignment,
  Umpire,
} from "@/lib/types/domain";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ResponseCell = "yes" | "if_need_be" | "no" | null;

export type ExportSlotHeader = {
  date: string;
  timeRange: string;
  slotId: string;
};

export type ResponseExportRow = {
  umpireName: string;
  cells: ResponseCell[];
};

export type ResponseExportData = {
  pollTitle: string;
  headers: ExportSlotHeader[];
  rows: ResponseExportRow[];
};

export type AssignmentExportRow = {
  date: string;
  time: string;
  homeTeam: string;
  awayTeam: string;
  venue: string;
  field: string;
  competition: string;
  assignedUmpires: string[];
  assignmentCount: string;
};

export type AssignmentExportData = {
  pollTitle: string;
  rows: AssignmentExportRow[];
};

/* ------------------------------------------------------------------ */
/*  Response export                                                    */
/* ------------------------------------------------------------------ */

export function prepareResponseExport(
  pollTitle: string,
  slots: PollSlot[],
  responses: AvailabilityResponse[],
  formatDate: (iso: string) => string,
  formatTime: (iso: string) => string,
): ResponseExportData {
  // Sort slots chronologically
  const sorted = slots
    .slice()
    .sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );

  // Build headers
  const headers: ExportSlotHeader[] = sorted.map((slot) => ({
    date: formatDate(slot.start_time),
    timeRange: `${formatTime(slot.start_time)} - ${formatTime(slot.end_time)}`,
    slotId: slot.id,
  }));

  // Extract unique participants (only those with umpire_id), sorted alphabetically
  const participantMap = new Map<string, string>();
  for (const r of responses) {
    if (r.umpire_id && !participantMap.has(r.umpire_id)) {
      participantMap.set(r.umpire_id, r.participant_name);
    }
  }
  const participants = Array.from(participantMap.entries())
    .map(([umpireId, name]) => ({ umpireId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Build response lookup: "slotId:umpireId" -> response
  const responseMap = new Map<string, ResponseCell>();
  for (const r of responses) {
    if (r.umpire_id) {
      responseMap.set(`${r.slot_id}:${r.umpire_id}`, r.response);
    }
  }

  // Build rows
  const rows: ResponseExportRow[] = participants.map(({ umpireId, name }) => ({
    umpireName: name,
    cells: sorted.map(
      (slot) => responseMap.get(`${slot.id}:${umpireId}`) ?? null,
    ),
  }));

  return { pollTitle, headers, rows };
}

/* ------------------------------------------------------------------ */
/*  Assignment export                                                  */
/* ------------------------------------------------------------------ */

export function prepareAssignmentExport(
  pollTitle: string,
  matches: Match[],
  assignments: Assignment[],
  umpires: Umpire[],
  formatDate: (iso: string) => string,
  formatTime: (iso: string) => string,
): AssignmentExportData {
  // Sort matches by date then start_time
  const sorted = matches.slice().sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.start_time ?? "").localeCompare(b.start_time ?? "");
  });

  // Build umpire name lookup
  const umpireNameMap = new Map<string, string>();
  for (const u of umpires) {
    umpireNameMap.set(u.id, u.name);
  }

  // Group assignments by match_id
  const assignmentsByMatch = new Map<string, string[]>();
  for (const a of assignments) {
    const names = assignmentsByMatch.get(a.match_id) ?? [];
    const name = umpireNameMap.get(a.umpire_id) ?? "";
    names.push(name);
    assignmentsByMatch.set(a.match_id, names);
  }

  const rows: AssignmentExportRow[] = sorted.map((match) => {
    const assignedUmpires = (assignmentsByMatch.get(match.id) ?? []).sort(
      (a, b) => a.localeCompare(b),
    );
    return {
      date: formatDate(match.date),
      time: match.start_time ? formatTime(match.start_time) : "",
      homeTeam: match.home_team,
      awayTeam: match.away_team,
      venue: match.venue ?? "",
      field: match.field ?? "",
      competition: match.competition ?? "",
      assignedUmpires,
      assignmentCount: `${assignedUmpires.length}/2`,
    };
  });

  return { pollTitle, rows };
}
