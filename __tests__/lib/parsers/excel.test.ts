import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseExcel } from "@/lib/parsers/excel";

/** Build a real .xlsx buffer in memory using ExcelJS */
async function buildExcelBuffer(
  rows: Record<string, string>[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");

  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(headers.map((h) => row[h] ?? ""));
    }
  }

  const result = await workbook.xlsx.writeBuffer();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (result as any).buffer as ArrayBuffer;
}

describe("parseExcel", () => {
  it("extracts rows from first sheet", async () => {
    const buf = await buildExcelBuffer([
      {
        Datum: "14-02-2026",
        Begintijd: "09:30",
        "Thuis team": "Heren 01",
        Tegenstander: "Opp",
      },
    ]);
    const rows = await parseExcel(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Datum"]).toBe("14-02-2026");
    expect(rows[0]["Thuis team"]).toBe("Heren 01");
  });

  it("returns empty array for workbook with no data rows", async () => {
    const buf = await buildExcelBuffer([]);
    const rows = await parseExcel(buf);
    expect(rows).toEqual([]);
  });

  it("handles empty cells as empty strings", async () => {
    const buf = await buildExcelBuffer([
      { Name: "Alice", Email: "" },
      { Name: "", Email: "bob@example.com" },
    ]);
    const rows = await parseExcel(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0]["Email"]).toBe("");
    expect(rows[1]["Name"]).toBe("");
  });
});
