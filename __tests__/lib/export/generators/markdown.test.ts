import { describe, it, expect } from "vitest";
import {
  generateResponseMarkdown,
  generateAssignmentMarkdown,
} from "@/lib/export/generators/markdown";
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

describe("generateResponseMarkdown", () => {
  it("contains poll title as heading", () => {
    const data: ResponseExportData = {
      pollTitle: "Weekend Poll",
      headers: [],
      rows: [],
    };
    const md = generateResponseMarkdown(data, labels);
    expect(md).toContain("# Weekend Poll");
  });

  it("returns just the title when there are no rows", () => {
    const data: ResponseExportData = {
      pollTitle: "Empty Poll",
      headers: [
        { date: "Sat 15 Mar", timeRange: "10:00 - 12:00", slotId: "s1" },
      ],
      rows: [],
    };
    const md = generateResponseMarkdown(data, labels);
    expect(md).toContain("# Empty Poll");
    expect(md).not.toContain("|");
  });

  it("produces a pipe-delimited table with separator row", () => {
    const data: ResponseExportData = {
      pollTitle: "Test",
      headers: [
        { date: "Sat 15 Mar", timeRange: "10:00 - 12:00", slotId: "s1" },
      ],
      rows: [{ umpireName: "Alice", cells: ["yes"] }],
    };
    const md = generateResponseMarkdown(data, labels);
    const lines = md.split("\n");
    const tableLines = lines.filter((l) => l.startsWith("|"));
    expect(tableLines).toHaveLength(3); // header + separator + 1 data row
    expect(tableLines[1]).toMatch(/^\|[\s-|]+\|$/);
  });

  it("uses correct symbols for response values", () => {
    const data: ResponseExportData = {
      pollTitle: "Test",
      headers: [
        { date: "Sat", timeRange: "10:00 - 12:00", slotId: "s1" },
        { date: "Sat", timeRange: "12:00 - 14:00", slotId: "s2" },
        { date: "Sat", timeRange: "14:00 - 16:00", slotId: "s3" },
        { date: "Sat", timeRange: "16:00 - 18:00", slotId: "s4" },
      ],
      rows: [
        {
          umpireName: "Alice",
          cells: ["yes", "if_need_be", "no", null],
        },
      ],
    };
    const md = generateResponseMarkdown(data, labels);
    // Find the data row (last table row)
    const dataRow = md
      .split("\n")
      .filter((l) => l.startsWith("|"))
      .pop()!;
    expect(dataRow).toContain("\u2713"); // checkmark for yes
    expect(dataRow).toContain("?"); // question mark for if_need_be
    expect(dataRow).toContain("\u2717"); // cross for no
    expect(dataRow).toContain("-"); // dash for null
  });

  it("escapes pipe characters in umpire names", () => {
    const data: ResponseExportData = {
      pollTitle: "Test",
      headers: [{ date: "Sat", timeRange: "10:00 - 12:00", slotId: "s1" }],
      rows: [{ umpireName: "Alice | Bob", cells: ["yes"] }],
    };
    const md = generateResponseMarkdown(data, labels);
    expect(md).toContain("Alice \\| Bob");
    // Ensure it doesn't break the table structure (should still have 3 table lines)
    const tableLines = md.split("\n").filter((l) => l.startsWith("|"));
    expect(tableLines).toHaveLength(3);
  });

  it("includes a legend line", () => {
    const data: ResponseExportData = {
      pollTitle: "Test",
      headers: [{ date: "Sat", timeRange: "10:00 - 12:00", slotId: "s1" }],
      rows: [{ umpireName: "Alice", cells: ["yes"] }],
    };
    const md = generateResponseMarkdown(data, labels);
    expect(md).toContain("= available");
    expect(md).toContain("= if need be");
    expect(md).toContain("= not available");
    expect(md).toContain("= no response");
  });
});

describe("generateAssignmentMarkdown", () => {
  it("contains poll title as heading", () => {
    const data: AssignmentExportData = {
      pollTitle: "Assignment Poll",
      rows: [],
    };
    const md = generateAssignmentMarkdown(data, columnLabels);
    expect(md).toContain("# Assignment Poll");
  });

  it("produces a table with column headers", () => {
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
          umpire2: "Bob",
          assignmentCount: "2/2",
        },
      ],
    };
    const md = generateAssignmentMarkdown(data, columnLabels);
    expect(md).toContain("| Date");
    expect(md).toContain("| Time");
    expect(md).toContain("| Home");
    expect(md).toContain("| Umpire 1");
    expect(md).toContain("| Umpire 2");
    // Data
    expect(md).toContain("Team A");
    expect(md).toContain("Alice");
    expect(md).toContain("Bob");
    expect(md).toContain("2/2");
  });

  it("returns just the title when there are no rows", () => {
    const data: AssignmentExportData = {
      pollTitle: "Empty",
      rows: [],
    };
    const md = generateAssignmentMarkdown(data, columnLabels);
    expect(md).toContain("# Empty");
    expect(md).not.toContain("|");
  });

  it("escapes pipe characters in team names", () => {
    const data: AssignmentExportData = {
      pollTitle: "Test",
      rows: [
        {
          date: "15 Mar",
          time: "14:00",
          homeTeam: "Team A|B",
          awayTeam: "Team C",
          venue: "",
          field: "",
          competition: "",
          umpire1: "",
          umpire2: "",
          assignmentCount: "0/2",
        },
      ],
    };
    const md = generateAssignmentMarkdown(data, columnLabels);
    expect(md).toContain("Team A\\|B");
  });
});
