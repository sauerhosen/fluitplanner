// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  generateResponseXlsx,
  generateAssignmentXlsx,
} from "@/lib/export/generators/xlsx";
import type {
  ResponseExportData,
  AssignmentExportData,
} from "@/lib/export/prepare-export-data";

const labels = {
  yes: "available",
  ifNeedBe: "if need be",
  no: "not available",
  noResponse: "no response",
};

const columnLabels = {
  date: "Date",
  time: "Time",
  homeTeam: "Home",
  awayTeam: "Away",
  venue: "Venue",
  field: "Field",
  competition: "Competition",
  umpire1: "Umpire 1",
  umpire2: "Umpire 2",
  count: "Count",
};

describe("generateResponseXlsx", () => {
  it("returns a Blob with correct MIME type", async () => {
    const data: ResponseExportData = {
      pollTitle: "Test Poll",
      headers: [
        { date: "Sat 15 Mar", timeRange: "10:00 - 12:00", slotId: "s1" },
      ],
      rows: [{ umpireName: "Alice", cells: ["yes"] }],
    };
    const blob = await generateResponseXlsx(data, labels);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(blob.size).toBeGreaterThan(0);
  });

  it("can be read back by ExcelJS with correct data", async () => {
    const data: ResponseExportData = {
      pollTitle: "Test Poll",
      headers: [
        { date: "Sat 15 Mar", timeRange: "10:00 - 12:00", slotId: "s1" },
      ],
      rows: [
        { umpireName: "Alice", cells: ["yes"] },
        { umpireName: "Bob", cells: ["no"] },
      ],
    };
    const blob = await generateResponseXlsx(data, labels);

    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const buffer = await blob.arrayBuffer();
    await workbook.xlsx.load(buffer);

    expect(workbook.worksheets).toHaveLength(1);
    const sheet = workbook.worksheets[0];

    // Title in row 1
    expect(sheet.getCell(1, 1).value).toBe("Test Poll");
    // Umpire names in rows 4+
    expect(sheet.getCell(4, 1).value).toBe("Alice");
    expect(sheet.getCell(5, 1).value).toBe("Bob");
    // Response values
    expect(sheet.getCell(4, 2).value).toBe("available");
    expect(sheet.getCell(5, 2).value).toBe("not available");
  });

  it("handles empty data", async () => {
    const data: ResponseExportData = {
      pollTitle: "Empty",
      headers: [],
      rows: [],
    };
    const blob = await generateResponseXlsx(data, labels);
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("generateAssignmentXlsx", () => {
  it("returns a Blob with correct MIME type", async () => {
    const data: AssignmentExportData = {
      pollTitle: "Test",
      rows: [
        {
          date: "15 Mar",
          time: "14:00",
          homeTeam: "Team A",
          awayTeam: "Team B",
          venue: "Stadium",
          field: "1",
          competition: "League",
          umpire1: "Alice",
          umpire2: "",
          assignmentCount: "1/2",
        },
      ],
    };
    const blob = await generateAssignmentXlsx(data, columnLabels);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(blob.size).toBeGreaterThan(0);
  });

  it("can be read back with correct data", async () => {
    const data: AssignmentExportData = {
      pollTitle: "Assignments",
      rows: [
        {
          date: "15 Mar",
          time: "14:00",
          homeTeam: "Team A",
          awayTeam: "Team B",
          venue: "Stadium",
          field: "1",
          competition: "League",
          umpire1: "Alice",
          umpire2: "Bob",
          assignmentCount: "2/2",
        },
      ],
    };
    const blob = await generateAssignmentXlsx(data, columnLabels);

    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const buffer = await blob.arrayBuffer();
    await workbook.xlsx.load(buffer);

    const sheet = workbook.worksheets[0];
    // Title
    expect(sheet.getCell(1, 1).value).toBe("Assignments");
    // Headers in row 2
    expect(sheet.getCell(2, 1).value).toBe("Date");
    expect(sheet.getCell(2, 8).value).toBe("Umpire 1");
    expect(sheet.getCell(2, 9).value).toBe("Umpire 2");
    // Data in row 3
    expect(sheet.getCell(3, 3).value).toBe("Team A");
    expect(sheet.getCell(3, 8).value).toBe("Alice");
    expect(sheet.getCell(3, 9).value).toBe("Bob");
    expect(sheet.getCell(3, 10).value).toBe("2/2");
  });
});
