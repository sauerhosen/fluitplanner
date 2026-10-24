import type {
  DaySheetExportData,
  DaySheetColumnLabels,
} from "../prepare-export-data";

/* ------------------------------------------------------------------ */
/*  Layout (pure — text measurement is injected)                       */
/* ------------------------------------------------------------------ */

export type TextStyle = "title" | "header" | "body";
export type MeasureText = (text: string, style: TextStyle) => number;

export type DaySheetImageLayout = {
  width: number;
  height: number;
  margin: number;
  rowHeight: number;
  cellPaddingX: number;
  title: { text: string; x: number; y: number };
  columns: { x: number; width: number }[];
  rows: { y: number; header: boolean; cells: string[] }[];
};

const MARGIN = 12;
const TITLE_HEIGHT = 28;
const ROW_HEIGHT = 26;
const CELL_PADDING_X = 8;

export function layoutDaySheetImage(
  data: DaySheetExportData,
  columnLabels: DaySheetColumnLabels,
  measure: MeasureText,
): DaySheetImageLayout {
  const table: { header: boolean; cells: string[] }[] =
    data.rows.length === 0
      ? [
          {
            header: false,
            cells: [columnLabels.noData ?? "No matches."],
          },
        ]
      : [
          {
            header: true,
            cells: [
              columnLabels.time,
              columnLabels.match,
              columnLabels.field,
              columnLabels.umpire1,
              columnLabels.umpire2,
            ],
          },
          ...data.rows.map((r) => ({
            header: false,
            cells: [r.time, r.match, r.field, r.umpire1, r.umpire2],
          })),
        ];

  const columnCount = table[0].cells.length;
  const columns: { x: number; width: number }[] = [];
  let x = MARGIN;
  for (let i = 0; i < columnCount; i++) {
    const widest = Math.max(
      ...table.map((row) =>
        measure(row.cells[i], row.header ? "header" : "body"),
      ),
    );
    const width = Math.ceil(widest) + CELL_PADDING_X * 2;
    columns.push({ x, width });
    x += width;
  }

  const tableTop = MARGIN + TITLE_HEIGHT;
  const rows = table.map((row, i) => ({
    ...row,
    y: tableTop + i * ROW_HEIGHT,
  }));

  const titleWidth = Math.ceil(measure(data.date, "title"));
  const width = Math.max(x, MARGIN + titleWidth) + MARGIN;
  const height = tableTop + rows.length * ROW_HEIGHT + MARGIN;

  return {
    width,
    height,
    margin: MARGIN,
    rowHeight: ROW_HEIGHT,
    cellPaddingX: CELL_PADDING_X,
    // y is the title's vertical centre (drawn with a "middle" baseline).
    title: { text: data.date, x: MARGIN, y: MARGIN + TITLE_HEIGHT / 2 },
    columns,
    rows,
  };
}

/* ------------------------------------------------------------------ */
/*  Rendering (browser only)                                           */
/* ------------------------------------------------------------------ */

const FONT_FAMILY =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const FONT_SIZE = 15;
const TITLE_FONT_SIZE = 17;
// Render at 2x so the pasted image stays sharp on high-density screens.
const SCALE = 2;

function font(style: TextStyle): string {
  const bold = style === "body" ? "" : "bold ";
  const size = style === "title" ? TITLE_FONT_SIZE : FONT_SIZE;
  return `${bold}${size}px ${FONT_FAMILY}`;
}

/**
 * Render a day sheet as a PNG — a plain table on white, ready to paste into a
 * chat or email. Always light, whatever the app theme, since it leaves the app.
 */
export async function generateDaySheetPng(
  data: DaySheetExportData,
  columnLabels: DaySheetColumnLabels,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  let measureStyle: TextStyle | null = null;
  const layout = layoutDaySheetImage(data, columnLabels, (text, style) => {
    if (style !== measureStyle) {
      ctx.font = font(style);
      measureStyle = style;
    }
    return ctx.measureText(text).width;
  });

  canvas.width = layout.width * SCALE;
  canvas.height = layout.height * SCALE;
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.width, layout.height);

  ctx.fillStyle = "#111827";
  ctx.textBaseline = "middle";
  ctx.font = font("title");
  ctx.fillText(layout.title.text, layout.title.x, layout.title.y);

  const tableLeft = layout.columns[0].x;
  const lastColumn = layout.columns[layout.columns.length - 1];
  const tableRight = lastColumn.x + lastColumn.width;

  for (const row of layout.rows) {
    if (row.header) {
      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(tableLeft, row.y, tableRight - tableLeft, layout.rowHeight);
    }
    ctx.fillStyle = "#111827";
    ctx.font = font(row.header ? "header" : "body");
    row.cells.forEach((text, i) => {
      ctx.fillText(
        text,
        layout.columns[i].x + layout.cellPaddingX,
        row.y + layout.rowHeight / 2,
      );
    });
  }

  // Grid lines, offset by half a pixel so 1px strokes land on whole pixels,
  // and run one pixel past the far edge so the bottom-right corner closes.
  const tableTop = layout.rows[0].y;
  const tableBottom = tableTop + layout.rows.length * layout.rowHeight;
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= layout.rows.length; i++) {
    const y = tableTop + i * layout.rowHeight + 0.5;
    ctx.moveTo(tableLeft, y);
    ctx.lineTo(tableRight + 1, y);
  }
  for (const col of [...layout.columns.map((c) => c.x), tableRight]) {
    ctx.moveTo(col + 0.5, tableTop);
    ctx.lineTo(col + 0.5, tableBottom + 1);
  }
  ctx.stroke();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png",
    );
  });
}
