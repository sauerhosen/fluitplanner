import { describe, it, expect } from "vitest";
import {
  generateResponseHtml,
  generateAssignmentHtml,
} from "@/lib/export/generators/html";
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
  umpires: "Umpires",
  count: "Count",
};

describe("generateResponseHtml", () => {
  it("contains DOCTYPE and html structure", () => {
    const data: ResponseExportData = {
      pollTitle: "Test",
      headers: [],
      rows: [],
    };
    const html = generateResponseHtml(data, labels);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
    expect(html).toContain('<meta charset="utf-8">');
  });

  it("contains poll title in h1 and title tag", () => {
    const data: ResponseExportData = {
      pollTitle: "Weekend Poll",
      headers: [],
      rows: [],
    };
    const html = generateResponseHtml(data, labels);
    expect(html).toContain("<h1>Weekend Poll</h1>");
    expect(html).toContain("<title>Weekend Poll</title>");
  });

  it("renders response values in table cells", () => {
    const data: ResponseExportData = {
      pollTitle: "Test",
      headers: [
        { date: "Sat 15 Mar", timeRange: "10:00 - 12:00", slotId: "s1" },
      ],
      rows: [
        { umpireName: "Alice", cells: ["yes"] },
        { umpireName: "Bob", cells: ["no"] },
      ],
    };
    const html = generateResponseHtml(data, labels);
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("available");
    expect(html).toContain("not available");
  });

  it("includes color styles for response types", () => {
    const data: ResponseExportData = {
      pollTitle: "Test",
      headers: [{ date: "Sat", timeRange: "10:00 - 12:00", slotId: "s1" }],
      rows: [
        { umpireName: "Alice", cells: ["yes"] },
        { umpireName: "Bob", cells: ["if_need_be"] },
        { umpireName: "Charlie", cells: ["no"] },
        { umpireName: "Dave", cells: [null] },
      ],
    };
    const html = generateResponseHtml(data, labels);
    expect(html).toContain("#dcfce7"); // green for yes
    expect(html).toContain("#fef9c3"); // yellow for if_need_be
    expect(html).toContain("#fee2e2"); // red for no
    expect(html).toContain("#f3f4f6"); // gray for no response
  });

  it("escapes HTML special characters", () => {
    const data: ResponseExportData = {
      pollTitle: 'Test <script>alert("xss")</script>',
      headers: [],
      rows: [],
    };
    const html = generateResponseHtml(data, labels);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("groups date headers with colSpan", () => {
    const data: ResponseExportData = {
      pollTitle: "Test",
      headers: [
        { date: "Sat 15 Mar", timeRange: "10:00 - 12:00", slotId: "s1" },
        { date: "Sat 15 Mar", timeRange: "12:00 - 14:00", slotId: "s2" },
        { date: "Sun 16 Mar", timeRange: "10:00 - 12:00", slotId: "s3" },
      ],
      rows: [{ umpireName: "Alice", cells: ["yes", "no", "yes"] }],
    };
    const html = generateResponseHtml(data, labels);
    expect(html).toContain('colspan="2"'); // Sat has 2 slots
  });
});

describe("generateAssignmentHtml", () => {
  it("contains DOCTYPE and html structure", () => {
    const data: AssignmentExportData = {
      pollTitle: "Test",
      rows: [],
    };
    const html = generateAssignmentHtml(data, columnLabels);
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("</html>");
  });

  it("renders match data in table", () => {
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
          assignedUmpires: ["Alice"],
          assignmentCount: "1/2",
        },
      ],
    };
    const html = generateAssignmentHtml(data, columnLabels);
    expect(html).toContain("Team A");
    expect(html).toContain("Team B");
    expect(html).toContain("Alice");
    expect(html).toContain("1/2");
    // Column headers
    expect(html).toContain("Date");
    expect(html).toContain("Umpires");
  });

  it("colors count cells", () => {
    const data: AssignmentExportData = {
      pollTitle: "Test",
      rows: [
        {
          date: "15 Mar",
          time: "14:00",
          homeTeam: "A",
          awayTeam: "B",
          venue: "",
          field: "",
          competition: "",
          assignedUmpires: ["Alice", "Bob"],
          assignmentCount: "2/2",
        },
      ],
    };
    const html = generateAssignmentHtml(data, columnLabels);
    expect(html).toContain("#dcfce7"); // green for 2/2
  });
});
