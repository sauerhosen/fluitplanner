import { describe, it, expect } from "vitest";
import { parseCSV } from "@/lib/parsers/csv";

const KNHB_HEADER =
  "Datum;Begintijd;Eindtijd;Locatie;Veld;Velddeel;Thuis team;Tegenstander club;Tegenstander;Scheidsrechter(s);DWF code Thuisteam;DWF code Uitteam;DWF code arbitrage;Gepubliceerd;Gepland;";

describe("parseCSV", () => {
  it("parses semicolon-delimited KNHB CSV", () => {
    const csv = `${KNHB_HEADER}\n14-02-2026;09:30;;Emergohal;V1;;Heren 01;T.H.C. Hurley;Hurley H1;;5936YG;1029FH;8463TU;Ja;Nee;`;
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Datum"]).toBe("14-02-2026");
    expect(rows[0]["Begintijd"]).toBe("09:30");
    expect(rows[0]["Thuis team"]).toBe("Heren 01");
    expect(rows[0]["Tegenstander"]).toBe("Hurley H1");
    expect(rows[0]["Locatie"]).toBe("Emergohal");
    expect(rows[0]["Veld"]).toBe("V1");
  });

  it("handles BOM character at start of file", () => {
    const csv = `\uFEFF${KNHB_HEADER}\n14-02-2026;09:30;;Emergohal;V1;;Heren 01;Club;Opp;;;;;;Ja;Nee;`;
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Datum"]).toBe("14-02-2026");
  });

  it("skips empty lines", () => {
    const csv = `${KNHB_HEADER}\n14-02-2026;09:30;;Loc;V1;;Team;Club;Opp;;;;;;Ja;Nee;\n\n15-02-2026;10:00;;Loc;V2;;Team;Club;Opp;;;;;;Ja;Nee;`;
    const rows = parseCSV(csv);
    expect(rows).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    const rows = parseCSV("");
    expect(rows).toEqual([]);
  });

  it("returns empty array for header-only input", () => {
    const rows = parseCSV(KNHB_HEADER);
    expect(rows).toEqual([]);
  });
});
