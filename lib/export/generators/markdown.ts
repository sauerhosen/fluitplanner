import type {
  ResponseExportData,
  AssignmentExportData,
  ResponseCell,
} from "../prepare-export-data";

const RESPONSE_SYMBOLS: Record<NonNullable<ResponseCell>, string> = {
  yes: "\u2713",
  if_need_be: "?",
  no: "\u2717",
};

function escapeMdCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function padCell(value: string, width: number): string {
  return value.padEnd(width);
}

/* ------------------------------------------------------------------ */
/*  Response export                                                    */
/* ------------------------------------------------------------------ */

export function generateResponseMarkdown(
  data: ResponseExportData,
  labels: { yes: string; ifNeedBe: string; no: string; noResponse: string },
): string {
  const lines: string[] = [];

  lines.push(`# ${data.pollTitle}`);
  lines.push("");

  if (data.rows.length === 0) {
    return lines.join("\n");
  }

  // Build column headers: first col is empty (umpire name), then slot headers
  const colHeaders = [
    "",
    ...data.headers.map((h) => escapeMdCell(`${h.date} ${h.timeRange}`)),
  ];
  const bodyRows = data.rows.map((row) => [
    escapeMdCell(row.umpireName),
    ...row.cells.map((cell) => (cell ? RESPONSE_SYMBOLS[cell] : "-")),
  ]);

  // Calculate column widths
  const colWidths = colHeaders.map((h, i) =>
    Math.max(
      h.length,
      ...bodyRows.map((row) => (row[i] ?? "").length),
      3, // minimum width for separator
    ),
  );

  // Header row
  lines.push(
    `| ${colHeaders.map((h, i) => padCell(h, colWidths[i])).join(" | ")} |`,
  );
  // Separator row
  lines.push(`| ${colWidths.map((w) => "-".repeat(w)).join(" | ")} |`);
  // Data rows
  for (const row of bodyRows) {
    lines.push(
      `| ${row.map((cell, i) => padCell(cell, colWidths[i])).join(" | ")} |`,
    );
  }

  lines.push("");
  lines.push(
    `${RESPONSE_SYMBOLS.yes} = ${labels.yes}, ? = ${labels.ifNeedBe}, ${RESPONSE_SYMBOLS.no} = ${labels.no}, - = ${labels.noResponse}`,
  );

  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Assignment export                                                  */
/* ------------------------------------------------------------------ */

export function generateAssignmentMarkdown(
  data: AssignmentExportData,
  columnLabels: {
    date: string;
    time: string;
    homeTeam: string;
    awayTeam: string;
    venue: string;
    field: string;
    competition: string;
    umpires: string;
    count: string;
  },
): string {
  const lines: string[] = [];

  lines.push(`# ${data.pollTitle}`);
  lines.push("");

  if (data.rows.length === 0) {
    return lines.join("\n");
  }

  const colHeaders = [
    escapeMdCell(columnLabels.date),
    escapeMdCell(columnLabels.time),
    escapeMdCell(columnLabels.homeTeam),
    escapeMdCell(columnLabels.awayTeam),
    escapeMdCell(columnLabels.venue),
    escapeMdCell(columnLabels.field),
    escapeMdCell(columnLabels.competition),
    escapeMdCell(columnLabels.umpires),
    escapeMdCell(columnLabels.count),
  ];

  const bodyRows = data.rows.map((row) => [
    escapeMdCell(row.date),
    escapeMdCell(row.time),
    escapeMdCell(row.homeTeam),
    escapeMdCell(row.awayTeam),
    escapeMdCell(row.venue),
    escapeMdCell(row.field),
    escapeMdCell(row.competition),
    escapeMdCell(row.assignedUmpires.join(", ")),
    escapeMdCell(row.assignmentCount),
  ]);

  // Calculate column widths
  const colWidths = colHeaders.map((h, i) =>
    Math.max(h.length, ...bodyRows.map((row) => (row[i] ?? "").length), 3),
  );

  // Header row
  lines.push(
    `| ${colHeaders.map((h, i) => padCell(h, colWidths[i])).join(" | ")} |`,
  );
  // Separator
  lines.push(`| ${colWidths.map((w) => "-".repeat(w)).join(" | ")} |`);
  // Data rows
  for (const row of bodyRows) {
    lines.push(
      `| ${row.map((cell, i) => padCell(cell, colWidths[i])).join(" | ")} |`,
    );
  }

  return lines.join("\n");
}
