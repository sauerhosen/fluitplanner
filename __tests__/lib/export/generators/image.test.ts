import { describe, it, expect } from "vitest";
import { layoutDaySheetImage } from "@/lib/export/generators/image";
import type {
  DaySheetExportData,
  DaySheetColumnLabels,
} from "@/lib/export/prepare-export-data";

const columnLabels: DaySheetColumnLabels = {
  time: "Tijd",
  match: "Wedstrijd",
  field: "Veld",
  umpire1: "Scheidsrechter 1",
  umpire2: "Scheidsrechter 2",
  noData: "Geen gegevens.",
};

const data: DaySheetExportData = {
  pollTitle: "Oktober",
  date: "za 31 okt",
  rows: [
    {
      time: "08:30",
      match: "AMVJ/VVV HC JO12-1 - Xenios JO12-1",
      field: "KG1",
      umpire1: "Femke Ploeger",
      umpire2: "Roland van den Berg",
    },
    {
      time: "10:15",
      match: "VVV HC MO12-1 - Hurley MO12-1",
      field: "Veld 2",
      umpire1: "Bram Heijnen",
      umpire2: "",
    },
  ],
};

// 10 px per character keeps widths predictable.
const measure = (text: string) => text.length * 10;

describe("layoutDaySheetImage", () => {
  it("draws the date as the title, then a header row and one row per match", () => {
    const layout = layoutDaySheetImage(data, columnLabels, measure);
    expect(layout.title.text).toBe("za 31 okt");
    expect(layout.rows.map((r) => r.cells[0])).toEqual([
      "Tijd",
      "08:30",
      "10:15",
    ]);
    expect(layout.rows[0].header).toBe(true);
    expect(layout.rows[1].header).toBe(false);
    expect(layout.rows[2].cells).toEqual([
      "10:15",
      "VVV HC MO12-1 - Hurley MO12-1",
      "Veld 2",
      "Bram Heijnen",
      "",
    ]);
  });

  it("sizes each column to its widest cell plus padding", () => {
    const layout = layoutDaySheetImage(data, columnLabels, measure);
    const [time, match, field, ump1, ump2] = layout.columns.map((c) => c.width);
    const pad = layout.cellPaddingX * 2;
    expect(time).toBe(50 + pad); // "08:30" == "10:15" > "Tijd"
    expect(match).toBe(340 + pad);
    expect(field).toBe(60 + pad);
    expect(ump1).toBe(160 + pad); // header is the widest
    expect(ump2).toBe(190 + pad); // "Roland van den Berg"
  });

  it("places columns side by side and sizes the canvas to fit", () => {
    const layout = layoutDaySheetImage(data, columnLabels, measure);
    for (let i = 1; i < layout.columns.length; i++) {
      const prev = layout.columns[i - 1];
      expect(layout.columns[i].x).toBe(prev.x + prev.width);
    }
    const last = layout.columns[layout.columns.length - 1];
    expect(layout.width).toBe(last.x + last.width + layout.margin);
    const lastRow = layout.rows[layout.rows.length - 1];
    expect(layout.height).toBe(lastRow.y + layout.rowHeight + layout.margin);
  });

  it("is never narrower than the title", () => {
    const layout = layoutDaySheetImage(
      { ...data, date: "x".repeat(200) },
      columnLabels,
      measure,
    );
    expect(layout.width).toBeGreaterThanOrEqual(2000 + layout.margin * 2);
  });

  it("shows the no-data message as a single row when there are no matches", () => {
    const layout = layoutDaySheetImage(
      { ...data, rows: [] },
      columnLabels,
      measure,
    );
    expect(layout.rows).toHaveLength(1);
    expect(layout.rows[0].cells).toEqual(["Geen gegevens."]);
    expect(layout.columns).toHaveLength(1);
  });
});
