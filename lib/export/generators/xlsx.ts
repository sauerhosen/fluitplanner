import type {
  ResponseExportData,
  AssignmentExportData,
  ResponseCell,
} from "../prepare-export-data";

type Fill = {
  type: "pattern";
  pattern: "solid";
  fgColor: { argb: string };
};

const RESPONSE_FILLS: Record<NonNullable<ResponseCell>, Fill> = {
  yes: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDCFCE7" },
  },
  if_need_be: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFEF9C3" },
  },
  no: {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFEE2E2" },
  },
};

const NO_RESPONSE_FILL: Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF3F4F6" },
};

const COUNT_FILLS: Record<string, Fill> = {
  "2/2": {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFDCFCE7" },
  },
  "1/2": {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFEF9C3" },
  },
  "0/2": {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFEE2E2" },
  },
};

/* ------------------------------------------------------------------ */
/*  Response export                                                    */
/* ------------------------------------------------------------------ */

export async function generateResponseXlsx(
  data: ResponseExportData,
  labels: { yes: string; ifNeedBe: string; no: string; noResponse: string },
): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(data.pollTitle.slice(0, 31) || "Export");

  const slotCount = data.headers.length;

  // Row 1: Poll title (merged)
  if (slotCount > 0) {
    sheet.mergeCells(1, 1, 1, slotCount + 1);
  }
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = data.pollTitle;
  titleCell.font = { bold: true, size: 14 };

  if (data.rows.length === 0) {
    const buffer = await workbook.xlsx.writeBuffer();
    return new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  // Row 2: Date headers (merged across same-date slots)
  const dateGroups: { date: string; startCol: number; count: number }[] = [];
  for (let i = 0; i < data.headers.length; i++) {
    const h = data.headers[i];
    const last = dateGroups[dateGroups.length - 1];
    if (last && last.date === h.date) {
      last.count++;
    } else {
      dateGroups.push({ date: h.date, startCol: i + 2, count: 1 }); // +2 because col 1 is umpire name
    }
  }
  for (const group of dateGroups) {
    if (group.count > 1) {
      sheet.mergeCells(2, group.startCol, 2, group.startCol + group.count - 1);
    }
    const cell = sheet.getCell(2, group.startCol);
    cell.value = group.date;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center" };
  }

  // Row 3: Time range sub-headers
  for (let i = 0; i < data.headers.length; i++) {
    const cell = sheet.getCell(3, i + 2);
    cell.value = data.headers[i].timeRange;
    cell.alignment = { horizontal: "center" };
    cell.font = { size: 10, color: { argb: "FF6B7280" } };
  }

  // Data rows
  for (let ri = 0; ri < data.rows.length; ri++) {
    const row = data.rows[ri];
    const excelRow = ri + 4; // offset by title + date + time rows
    sheet.getCell(excelRow, 1).value = row.umpireName;
    sheet.getCell(excelRow, 1).font = { bold: true };

    for (let ci = 0; ci < row.cells.length; ci++) {
      const cell = sheet.getCell(excelRow, ci + 2);
      const value = row.cells[ci];
      cell.value = value
        ? value === "yes"
          ? labels.yes
          : value === "if_need_be"
            ? labels.ifNeedBe
            : labels.no
        : labels.noResponse;
      cell.fill = value ? RESPONSE_FILLS[value] : NO_RESPONSE_FILL;
      cell.alignment = { horizontal: "center" };
    }
  }

  // Auto-width for umpire name column
  const maxNameLen = Math.max(8, ...data.rows.map((r) => r.umpireName.length));
  sheet.getColumn(1).width = maxNameLen + 2;
  // Fixed width for slot columns
  for (let i = 0; i < slotCount; i++) {
    sheet.getColumn(i + 2).width = 16;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ------------------------------------------------------------------ */
/*  Assignment export                                                  */
/* ------------------------------------------------------------------ */

export async function generateAssignmentXlsx(
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
): Promise<Blob> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(data.pollTitle.slice(0, 31) || "Export");

  const headers = [
    columnLabels.date,
    columnLabels.time,
    columnLabels.homeTeam,
    columnLabels.awayTeam,
    columnLabels.venue,
    columnLabels.field,
    columnLabels.competition,
    columnLabels.umpires,
    columnLabels.count,
  ];

  // Row 1: Poll title (merged)
  sheet.mergeCells(1, 1, 1, headers.length);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = data.pollTitle;
  titleCell.font = { bold: true, size: 14 };

  // Row 2: Column headers
  for (let i = 0; i < headers.length; i++) {
    const cell = sheet.getCell(2, i + 1);
    cell.value = headers[i];
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF9FAFB" },
    };
  }

  // Data rows
  for (let ri = 0; ri < data.rows.length; ri++) {
    const row = data.rows[ri];
    const excelRow = ri + 3;
    const values = [
      row.date,
      row.time,
      row.homeTeam,
      row.awayTeam,
      row.venue,
      row.field,
      row.competition,
      row.assignedUmpires.join(", "),
      row.assignmentCount,
    ];
    for (let ci = 0; ci < values.length; ci++) {
      const cell = sheet.getCell(excelRow, ci + 1);
      cell.value = values[ci];
    }

    // Color the count cell
    const countCell = sheet.getCell(excelRow, headers.length);
    const fill = COUNT_FILLS[row.assignmentCount];
    if (fill) {
      countCell.fill = fill;
    }
    countCell.alignment = { horizontal: "center" };
  }

  // Auto-width columns
  const colWidths = [12, 8, 20, 20, 16, 8, 16, 30, 8];
  for (let i = 0; i < colWidths.length; i++) {
    sheet.getColumn(i + 1).width = colWidths[i];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
