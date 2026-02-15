import { describe, it, expect } from "vitest";
import { mapKNHBRows, extractHomeTeams } from "@/lib/parsers/knhb-mapper";
import type { RawRow } from "@/lib/parsers/types";
import type { ManagedTeam } from "@/lib/types/domain";

const team = (name: string, level: 1 | 2 | 3 = 1): ManagedTeam => ({
  id: "t1",
  name,
  required_level: level,
  created_by: "u1",
  created_at: "2025-01-01",
  organization_id: null,
});

const row = (overrides: Partial<Record<string, string>> = {}): RawRow => ({
  Datum: "14-02-2026",
  Begintijd: "09:30",
  "Thuis team": "Heren 01",
  Tegenstander: "Opponent H1",
  Locatie: "Escapade (HIC)",
  Veld: "KG1",
  ...overrides,
});

describe("mapKNHBRows", () => {
  it("maps a basic row with all fields", () => {
    const result = mapKNHBRows([row()], {
      managedTeams: [team("Heren 01", 3)],
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toEqual({
      date: "2026-02-14",
      start_time: "2026-02-14T09:30:00",
      home_team: "Heren 01",
      away_team: "Opponent H1",
      venue: "Escapade (HIC)",
      field: "KG1",
      competition: null,
      required_level: 3,
    });
  });

  it("filters out rows not matching managed teams", () => {
    const result = mapKNHBRows([row(), row({ "Thuis team": "Dames 01" })], {
      managedTeams: [team("Heren 01")],
    });
    expect(result.matches).toHaveLength(1);
    expect(result.skippedCount).toBe(1);
  });

  it("handles missing start time", () => {
    const result = mapKNHBRows([row({ Begintijd: "" })], {
      managedTeams: [team("Heren 01")],
    });
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].start_time).toBeNull();
  });

  it("parses DD-MM-YYYY date to YYYY-MM-DD", () => {
    const result = mapKNHBRows([row({ Datum: "01-03-2026" })], {
      managedTeams: [team("Heren 01")],
    });
    expect(result.matches[0].date).toBe("2026-03-01");
  });

  it("handles missing venue and field", () => {
    const result = mapKNHBRows([row({ Locatie: "", Veld: "" })], {
      managedTeams: [team("Heren 01")],
    });
    expect(result.matches[0].venue).toBeNull();
    expect(result.matches[0].field).toBeNull();
  });

  it("reports error for row missing required date", () => {
    const result = mapKNHBRows([row({ Datum: "" })], {
      managedTeams: [team("Heren 01")],
    });
    expect(result.matches).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("reports error for row missing home team", () => {
    const result = mapKNHBRows([row({ "Thuis team": "" })], {
      managedTeams: [team("Heren 01")],
    });
    expect(result.matches).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("reports error for row missing away team", () => {
    const result = mapKNHBRows([row({ Tegenstander: "" })], {
      managedTeams: [team("Heren 01")],
    });
    expect(result.matches).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });

  it("returns empty result for empty input", () => {
    const result = mapKNHBRows([], { managedTeams: [team("Heren 01")] });
    expect(result.matches).toHaveLength(0);
    expect(result.skippedCount).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("handles multiple managed teams", () => {
    const result = mapKNHBRows(
      [
        row({ "Thuis team": "Heren 01" }),
        row({ "Thuis team": "Dames 01" }),
        row({ "Thuis team": "Heren 02" }),
      ],
      { managedTeams: [team("Heren 01", 3), team("Dames 01", 2)] },
    );
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].required_level).toBe(3);
    expect(result.matches[1].required_level).toBe(2);
    expect(result.skippedCount).toBe(1);
  });
});

describe("extractHomeTeams", () => {
  it("returns unique home team names from rows", () => {
    const rows = [
      row({ "Thuis team": "Team A" }),
      row({ "Thuis team": "Team B" }),
      row({ "Thuis team": "Team A" }), // duplicate
    ];
    expect(extractHomeTeams(rows)).toEqual(["Team A", "Team B"]);
  });

  it("trims whitespace and skips empty names", () => {
    const rows = [
      row({ "Thuis team": " Team A " }),
      row({ "Thuis team": "" }),
      row({ "Thuis team": "  " }),
    ];
    expect(extractHomeTeams(rows)).toEqual(["Team A"]);
  });
});

describe("mapKNHBRows with selectedTeams", () => {
  it("filters by selectedTeams instead of managedTeams when provided", () => {
    const rows = [
      row({ "Thuis team": "Team A" }),
      row({ "Thuis team": "Team B" }),
      row({ "Thuis team": "Team C" }),
    ];
    const result = mapKNHBRows(rows, {
      managedTeams: [team("Team A", 3)],
      selectedTeams: ["Team A", "Team B"],
    });
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].home_team).toBe("Team A");
    expect(result.matches[1].home_team).toBe("Team B");
  });

  it("uses managed team required_level when available, defaults to 1 otherwise", () => {
    const rows = [
      row({ "Thuis team": "Team A" }),
      row({ "Thuis team": "Team B" }),
    ];
    const result = mapKNHBRows(rows, {
      managedTeams: [team("Team A", 3)],
      selectedTeams: ["Team A", "Team B"],
    });
    expect(result.matches[0].required_level).toBe(3); // from managed team
    expect(result.matches[1].required_level).toBe(1); // default
  });

  it("reports skipped count for teams not in selectedTeams", () => {
    const rows = [
      row({ "Thuis team": "Team A" }),
      row({ "Thuis team": "Team C" }),
    ];
    const result = mapKNHBRows(rows, {
      managedTeams: [],
      selectedTeams: ["Team A"],
    });
    expect(result.matches).toHaveLength(1);
    expect(result.skippedCount).toBe(1);
  });
});
