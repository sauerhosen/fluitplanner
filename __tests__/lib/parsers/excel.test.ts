import { describe, it, expect, vi } from "vitest";
import { parseExcel } from "@/lib/parsers/excel";

vi.mock("xlsx", () => ({
  read: vi.fn((data) => data.__mockWorkbook),
  utils: {
    sheet_to_json: vi.fn((sheet) => sheet.__mockData),
  },
}));

function mockExcelBuffer(rows: Record<string, string>[]) {
  const buf = new ArrayBuffer(0) as ArrayBuffer & {
    __mockWorkbook: {
      SheetNames: string[];
      Sheets: Record<string, { __mockData: Record<string, string>[] }>;
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (buf as any).__mockWorkbook = {
    SheetNames: ["Sheet1"],
    Sheets: {
      Sheet1: { __mockData: rows },
    },
  };
  return buf;
}

describe("parseExcel", () => {
  it("extracts rows from first sheet", () => {
    const buf = mockExcelBuffer([
      {
        Datum: "14-02-2026",
        Begintijd: "09:30",
        "Thuis team": "Heren 01",
        Tegenstander: "Opp",
      },
    ]);
    const rows = parseExcel(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Datum"]).toBe("14-02-2026");
    expect(rows[0]["Thuis team"]).toBe("Heren 01");
  });

  it("returns empty array for workbook with no data rows", () => {
    const buf = mockExcelBuffer([]);
    const rows = parseExcel(buf);
    expect(rows).toEqual([]);
  });
});
