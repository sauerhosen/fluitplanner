import type {
  ResponseExportData,
  AssignmentExportData,
  ResponseCell,
} from "../prepare-export-data";

const COLORS: Record<
  NonNullable<ResponseCell>,
  { bg: string; text: string }
> = {
  yes: { bg: "#dcfce7", text: "#166534" },
  if_need_be: { bg: "#fef9c3", text: "#854d0e" },
  no: { bg: "#fee2e2", text: "#991b1b" },
};

const NO_RESPONSE_COLOR = { bg: "#f3f4f6", text: "#6b7280" };

const BASE_STYLE = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 2rem; color: #1f2937; }
  h1 { font-size: 1.5rem; margin-bottom: 1rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #d1d5db; padding: 6px 10px; text-align: center; font-size: 0.875rem; }
  th { background: #f9fafb; font-weight: 600; }
  td:first-child, th:first-child { text-align: left; white-space: nowrap; }
  .legend { margin-top: 1rem; font-size: 0.8rem; color: #6b7280; }
  .legend span { display: inline-block; width: 18px; height: 18px; border-radius: 3px; vertical-align: middle; margin-right: 4px; }
`.trim();

function wrapHtml(title: string, body: string, locale = "en"): string {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${BASE_STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ */
/*  Response export                                                    */
/* ------------------------------------------------------------------ */

export function generateResponseHtml(
  data: ResponseExportData,
  labels: {
    yes: string;
    ifNeedBe: string;
    no: string;
    noResponse: string;
    noData?: string;
  },
  locale = "en",
): string {
  if (data.rows.length === 0) {
    const emptyMsg = labels.noData ?? "No responses.";
    return wrapHtml(
      data.pollTitle,
      `<h1>${escapeHtml(data.pollTitle)}</h1><p>${escapeHtml(emptyMsg)}</p>`,
      locale,
    );
  }

  // Group headers by date for colSpan
  const dateGroups: { date: string; count: number }[] = [];
  for (const h of data.headers) {
    const last = dateGroups[dateGroups.length - 1];
    if (last && last.date === h.date) {
      last.count++;
    } else {
      dateGroups.push({ date: h.date, count: 1 });
    }
  }

  // Build thead rows
  const theadRows: string[] = [];

  // Date header row
  theadRows.push("<tr>");
  theadRows.push("<th></th>");
  for (const group of dateGroups) {
    theadRows.push(
      `<th colspan="${group.count}">${escapeHtml(group.date)}</th>`,
    );
  }
  theadRows.push("</tr>");

  // Time range header row
  theadRows.push("<tr>");
  theadRows.push("<th></th>");
  for (const h of data.headers) {
    theadRows.push(`<th>${escapeHtml(h.timeRange)}</th>`);
  }
  theadRows.push("</tr>");

  // Build tbody rows
  const tbodyRows: string[] = [];
  for (const row of data.rows) {
    tbodyRows.push("<tr>");
    tbodyRows.push(`<td>${escapeHtml(row.umpireName)}</td>`);
    for (const cell of row.cells) {
      const color = cell ? COLORS[cell] : NO_RESPONSE_COLOR;
      const label = cell
        ? cell === "yes"
          ? labels.yes
          : cell === "if_need_be"
            ? labels.ifNeedBe
            : labels.no
        : labels.noResponse;
      tbodyRows.push(
        `<td style="background:${color.bg};color:${color.text}">${escapeHtml(label)}</td>`,
      );
    }
    tbodyRows.push("</tr>");
  }

  const legend = `<div class="legend">
<span style="background:${COLORS.yes.bg}"></span>${escapeHtml(labels.yes)}
&nbsp;&nbsp;
<span style="background:${COLORS.if_need_be.bg}"></span>${escapeHtml(labels.ifNeedBe)}
&nbsp;&nbsp;
<span style="background:${COLORS.no.bg}"></span>${escapeHtml(labels.no)}
&nbsp;&nbsp;
<span style="background:${NO_RESPONSE_COLOR.bg}"></span>${escapeHtml(labels.noResponse)}
</div>`;

  return wrapHtml(
    data.pollTitle,
    `<h1>${escapeHtml(data.pollTitle)}</h1>\n<table>\n<thead>\n${theadRows.join("\n")}\n</thead>\n<tbody>\n${tbodyRows.join("\n")}\n</tbody>\n</table>\n${legend}`,
    locale,
  );
}

/* ------------------------------------------------------------------ */
/*  Assignment export                                                  */
/* ------------------------------------------------------------------ */

export function generateAssignmentHtml(
  data: AssignmentExportData,
  columnLabels: {
    date: string;
    time: string;
    homeTeam: string;
    awayTeam: string;
    venue: string;
    field: string;
    competition: string;
    umpire1: string;
    umpire2: string;
    count: string;
    noData?: string;
  },
  locale = "en",
): string {
  if (data.rows.length === 0) {
    const emptyMsg = columnLabels.noData ?? "No assignments.";
    return wrapHtml(
      data.pollTitle,
      `<h1>${escapeHtml(data.pollTitle)}</h1><p>${escapeHtml(emptyMsg)}</p>`,
      locale,
    );
  }

  const headers = [
    columnLabels.date,
    columnLabels.time,
    columnLabels.homeTeam,
    columnLabels.awayTeam,
    columnLabels.venue,
    columnLabels.field,
    columnLabels.competition,
    columnLabels.umpire1,
    columnLabels.umpire2,
    columnLabels.count,
  ];

  const countColors: Record<string, { bg: string; text: string }> = {
    "2/2": { bg: "#dcfce7", text: "#166534" },
    "1/2": { bg: "#fef9c3", text: "#854d0e" },
    "0/2": { bg: "#fee2e2", text: "#991b1b" },
  };

  const headerRow = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;

  const bodyRows = data.rows
    .map((row) => {
      const cc = countColors[row.assignmentCount] ?? NO_RESPONSE_COLOR;
      return `<tr>
<td>${escapeHtml(row.date)}</td>
<td>${escapeHtml(row.time)}</td>
<td>${escapeHtml(row.homeTeam)}</td>
<td>${escapeHtml(row.awayTeam)}</td>
<td>${escapeHtml(row.venue)}</td>
<td>${escapeHtml(row.field)}</td>
<td>${escapeHtml(row.competition)}</td>
<td>${escapeHtml(row.umpire1)}</td>
<td>${escapeHtml(row.umpire2)}</td>
<td style="background:${cc.bg};color:${cc.text}">${escapeHtml(row.assignmentCount)}</td>
</tr>`;
    })
    .join("\n");

  return wrapHtml(
    data.pollTitle,
    `<h1>${escapeHtml(data.pollTitle)}</h1>\n<table>\n<thead>\n${headerRow}\n</thead>\n<tbody>\n${bodyRows}\n</tbody>\n</table>`,
    locale,
  );
}
