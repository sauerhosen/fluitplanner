import { describe, it, expect } from "vitest";
import { parsePaste } from "@/lib/parsers/paste";

describe("parsePaste", () => {
  it("detects semicolon delimiter (KNHB format)", () => {
    const text =
      "Datum;Begintijd;Thuis team;Tegenstander\n14-02-2026;09:30;Heren 01;Opp";
    const rows = parsePaste(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Datum"]).toBe("14-02-2026");
  });

  it("detects tab delimiter (spreadsheet paste)", () => {
    const text =
      "Datum\tBegintijd\tThuis team\tTegenstander\n14-02-2026\t09:30\tHeren 01\tOpp";
    const rows = parsePaste(text);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Datum"]).toBe("14-02-2026");
  });

  it("returns empty array for empty input", () => {
    expect(parsePaste("")).toEqual([]);
    expect(parsePaste("  ")).toEqual([]);
  });
});
