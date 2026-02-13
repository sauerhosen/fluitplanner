# Stage 2: Match Management — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable the planner to upload KNHB match schedules (CSV/Excel/paste), manage a list of teams to track, and view/edit/delete matches in a grouped table.

**Architecture:** Client-side file parsing (Papa Parse + SheetJS) feeds a shared KNHB column mapper that filters by managed teams. Server actions handle upsert/CRUD against Supabase. Two new routes: `/protected/settings` (team config) and `/protected/matches` (match list + upload).

**Tech Stack:** Next.js App Router, Supabase, Papa Parse, SheetJS (xlsx), shadcn/ui, Vitest, Testing Library

**Design doc:** `docs/plans/2026-02-13-stage2-design.md`

---

### Task 1: Install Dependencies

**Step 1: Install papaparse and xlsx**

Run: `npm install papaparse xlsx && npm install -D @types/papaparse`

**Step 2: Verify installation**

Run: `npm ls papaparse xlsx`
Expected: Both packages listed.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add papaparse and xlsx dependencies for match import"
```

---

### Task 2: Database Migration — Schema Changes

**Files:**

- Create: `supabase/migrations/20260213000003_stage2_schema.sql`

**Step 1: Write the migration**

```sql
-- Stage 2: Match management schema changes

-- Managed teams table
create table public.managed_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  required_level integer not null default 1 check (required_level in (1, 2, 3)),
  created_by uuid references auth.users not null,
  created_at timestamptz default now() not null,
  unique (name, created_by)
);

create index idx_managed_teams_created_by on public.managed_teams (created_by);

-- Add columns to matches
alter table public.matches add column field text;
alter table public.matches add column required_level integer default 1 check (required_level in (1, 2, 3));

-- Make start_time nullable (some KNHB rows lack times)
alter table public.matches alter column start_time drop not null;

-- Natural key for upsert on re-import
alter table public.matches add constraint matches_unique_natural_key
  unique (date, home_team, away_team, created_by);

-- RLS for managed_teams
alter table public.managed_teams enable row level security;

create policy "Authenticated users can select managed_teams"
  on public.managed_teams for select to authenticated
  using (auth.uid() = created_by);

create policy "Authenticated users can insert managed_teams"
  on public.managed_teams for insert to authenticated
  with check (auth.uid() = created_by);

create policy "Authenticated users can update managed_teams"
  on public.managed_teams for update to authenticated
  using (auth.uid() = created_by);

create policy "Authenticated users can delete managed_teams"
  on public.managed_teams for delete to authenticated
  using (auth.uid() = created_by);
```

**Step 2: Commit**

```bash
git add supabase/migrations/20260213000003_stage2_schema.sql
git commit -m "feat: add Stage 2 schema — managed_teams table, matches field/level columns, upsert constraint"
```

---

### Task 3: Update Domain Types

**Files:**

- Modify: `lib/types/domain.ts`

**Step 1: Add ManagedTeam type and update Match type**

Add to `lib/types/domain.ts`:

```typescript
export type ManagedTeam = {
  id: string;
  name: string;
  required_level: 1 | 2 | 3;
  created_by: string;
  created_at: string;
};
```

Update existing `Match` type — add `field` and `required_level`, make `start_time` nullable:

```typescript
export type Match = {
  id: string;
  date: string;
  start_time: string | null;
  home_team: string;
  away_team: string;
  competition: string | null;
  venue: string | null;
  field: string | null;
  required_level: 1 | 2 | 3;
  created_by: string;
  created_at: string;
};
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors (or known pre-existing errors only).

**Step 3: Commit**

```bash
git add lib/types/domain.ts
git commit -m "feat: add ManagedTeam type, update Match with field/required_level"
```

---

### Task 4: Parser Types

**Files:**

- Create: `lib/parsers/types.ts`

**Step 1: Create parser types**

```typescript
import type { ManagedTeam } from "@/lib/types/domain";

export type RawRow = Record<string, string>;

export type ParsedMatch = {
  date: string;
  start_time: string | null;
  home_team: string;
  away_team: string;
  venue: string | null;
  field: string | null;
  competition: string | null;
  required_level: 1 | 2 | 3;
};

export type ParseResult = {
  matches: ParsedMatch[];
  skippedCount: number;
  errors: string[];
};

export type MapperOptions = {
  managedTeams: ManagedTeam[];
};
```

**Step 2: Commit**

```bash
git add lib/parsers/types.ts
git commit -m "feat: add parser types (RawRow, ParsedMatch, ParseResult)"
```

---

### Task 5: TDD KNHB Mapper — Write Failing Tests

**Files:**

- Create: `__tests__/lib/parsers/knhb-mapper.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { mapKNHBRows } from "@/lib/parsers/knhb-mapper";
import type { RawRow } from "@/lib/parsers/types";
import type { ManagedTeam } from "@/lib/types/domain";

const team = (name: string, level: 1 | 2 | 3 = 1): ManagedTeam => ({
  id: "t1",
  name,
  required_level: level,
  created_by: "u1",
  created_at: "2025-01-01",
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/parsers/knhb-mapper.test.ts`
Expected: FAIL — cannot find module `@/lib/parsers/knhb-mapper`.

---

### Task 6: Implement KNHB Mapper

**Files:**

- Create: `lib/parsers/knhb-mapper.ts`

**Step 1: Write implementation**

```typescript
import type { ManagedTeam } from "@/lib/types/domain";
import type { RawRow, ParseResult, ParsedMatch, MapperOptions } from "./types";

function parseDutchDate(dateStr: string): string | null {
  const match = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function parseTime(dateISO: string, timeStr: string): string | null {
  if (!timeStr || !timeStr.trim()) return null;
  return `${dateISO}T${timeStr.trim()}:00`;
}

export function mapKNHBRows(
  rows: RawRow[],
  options: MapperOptions,
): ParseResult {
  const teamMap = new Map<string, ManagedTeam>();
  for (const t of options.managedTeams) {
    teamMap.set(t.name, t);
  }

  const matches: ParsedMatch[] = [];
  const errors: string[] = [];
  let skippedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const homeTeam = (row["Thuis team"] ?? "").trim();
    const awayTeam = (row["Tegenstander"] ?? "").trim();
    const datumRaw = (row["Datum"] ?? "").trim();

    // Filter by managed teams
    const managedTeam = teamMap.get(homeTeam);
    if (!managedTeam) {
      skippedCount++;
      continue;
    }

    // Validate required fields
    if (!datumRaw) {
      errors.push(`Row ${i + 1}: missing date`);
      continue;
    }
    if (!homeTeam) {
      errors.push(`Row ${i + 1}: missing home team`);
      continue;
    }
    if (!awayTeam) {
      errors.push(`Row ${i + 1}: missing away team`);
      continue;
    }

    const dateISO = parseDutchDate(datumRaw);
    if (!dateISO) {
      errors.push(`Row ${i + 1}: invalid date format "${datumRaw}"`);
      continue;
    }

    const timeRaw = (row["Begintijd"] ?? "").trim();
    const startTime = parseTime(dateISO, timeRaw);

    const venue = (row["Locatie"] ?? "").trim() || null;
    const field = (row["Veld"] ?? "").trim() || null;

    matches.push({
      date: dateISO,
      start_time: startTime,
      home_team: homeTeam,
      away_team: awayTeam,
      venue,
      field,
      competition: null,
      required_level: managedTeam.required_level,
    });
  }

  return { matches, skippedCount, errors };
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/parsers/knhb-mapper.test.ts`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add lib/parsers/knhb-mapper.ts __tests__/lib/parsers/knhb-mapper.test.ts
git commit -m "feat: add KNHB CSV row mapper with team filtering and date parsing"
```

---

### Task 7: TDD CSV Parser — Write Failing Tests

**Files:**

- Create: `__tests__/lib/parsers/csv.test.ts`

**Step 1: Write failing tests**

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/parsers/csv.test.ts`
Expected: FAIL — cannot find module `@/lib/parsers/csv`.

---

### Task 8: Implement CSV Parser

**Files:**

- Create: `lib/parsers/csv.ts`

**Step 1: Write implementation**

```typescript
import Papa from "papaparse";
import type { RawRow } from "./types";

export function parseCSV(text: string): RawRow[] {
  if (!text.trim()) return [];

  const result = Papa.parse<RawRow>(text, {
    delimiter: ";",
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  return result.data;
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/parsers/csv.test.ts`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add lib/parsers/csv.ts __tests__/lib/parsers/csv.test.ts
git commit -m "feat: add CSV parser with semicolon/BOM support"
```

---

### Task 9: TDD Excel Parser — Write Failing Tests

**Files:**

- Create: `__tests__/lib/parsers/excel.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect, vi } from "vitest";
import { parseExcel } from "@/lib/parsers/excel";

// Mock xlsx module — we don't need real Excel files in unit tests
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/parsers/excel.test.ts`
Expected: FAIL — cannot find module `@/lib/parsers/excel`.

---

### Task 10: Implement Excel Parser

**Files:**

- Create: `lib/parsers/excel.ts`

**Step 1: Write implementation**

```typescript
import * as XLSX from "xlsx";
import type { RawRow } from "./types";

export function parseExcel(data: ArrayBuffer): RawRow[] {
  const workbook = XLSX.read(data);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<RawRow>(sheet);
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/parsers/excel.test.ts`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add lib/parsers/excel.ts __tests__/lib/parsers/excel.test.ts
git commit -m "feat: add Excel parser using SheetJS"
```

---

### Task 11: TDD Paste Parser — Write Failing Tests

**Files:**

- Create: `__tests__/lib/parsers/paste.test.ts`

**Step 1: Write failing tests**

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/parsers/paste.test.ts`
Expected: FAIL — cannot find module `@/lib/parsers/paste`.

---

### Task 12: Implement Paste Parser

**Files:**

- Create: `lib/parsers/paste.ts`

**Step 1: Write implementation**

```typescript
import Papa from "papaparse";
import type { RawRow } from "./types";

function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  return tabs > semicolons ? "\t" : ";";
}

export function parsePaste(text: string): RawRow[] {
  if (!text.trim()) return [];

  const delimiter = detectDelimiter(text);
  const result = Papa.parse<RawRow>(text, {
    delimiter,
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  return result.data;
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/parsers/paste.test.ts`
Expected: All tests PASS.

**Step 3: Commit**

```bash
git add lib/parsers/paste.ts __tests__/lib/parsers/paste.test.ts
git commit -m "feat: add paste parser with tab/semicolon auto-detection"
```

---

### Task 13: Server Actions — Managed Teams

**Files:**

- Create: `lib/actions/managed-teams.ts`

**Step 1: Write server actions**

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import type { ManagedTeam } from "@/lib/types/domain";

export async function getManagedTeams(): Promise<ManagedTeam[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("managed_teams")
    .select("*")
    .order("name");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createManagedTeam(
  name: string,
  requiredLevel: 1 | 2 | 3,
): Promise<ManagedTeam> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("managed_teams")
    .insert({
      name: name.trim(),
      required_level: requiredLevel,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateManagedTeam(
  id: string,
  name: string,
  requiredLevel: 1 | 2 | 3,
): Promise<ManagedTeam> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("managed_teams")
    .update({ name: name.trim(), required_level: requiredLevel })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteManagedTeam(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("managed_teams").delete().eq("id", id);

  if (error) throw new Error(error.message);
}
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors.

**Step 3: Commit**

```bash
git add lib/actions/managed-teams.ts
git commit -m "feat: add server actions for managed teams CRUD"
```

---

### Task 14: Server Actions — Matches

**Files:**

- Create: `lib/actions/matches.ts`

**Step 1: Write server actions**

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import type { Match } from "@/lib/types/domain";
import type { ParsedMatch } from "@/lib/parsers/types";

export async function upsertMatches(
  matches: ParsedMatch[],
): Promise<{ inserted: number; updated: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  let inserted = 0;
  let updated = 0;

  for (const match of matches) {
    const row = {
      date: match.date,
      start_time: match.start_time,
      home_team: match.home_team,
      away_team: match.away_team,
      venue: match.venue,
      field: match.field,
      competition: match.competition,
      required_level: match.required_level,
      created_by: user.id,
    };

    const { data: existing } = await supabase
      .from("matches")
      .select("id")
      .eq("date", match.date)
      .eq("home_team", match.home_team)
      .eq("away_team", match.away_team)
      .eq("created_by", user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("matches")
        .update({
          start_time: row.start_time,
          venue: row.venue,
          field: row.field,
          required_level: row.required_level,
          competition: row.competition,
        })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      updated++;
    } else {
      const { error } = await supabase.from("matches").insert(row);
      if (error) throw new Error(error.message);
      inserted++;
    }
  }

  return { inserted, updated };
}

export type MatchFilters = {
  search?: string;
  requiredLevel?: 1 | 2 | 3;
  dateFrom?: string;
  dateTo?: string;
};

export async function getMatches(filters?: MatchFilters): Promise<Match[]> {
  const supabase = await createClient();
  let query = supabase
    .from("matches")
    .select("*")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (filters?.dateFrom) {
    query = query.gte("date", filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte("date", filters.dateTo);
  }
  if (filters?.requiredLevel) {
    query = query.eq("required_level", filters.requiredLevel);
  }
  if (filters?.search) {
    query = query.or(
      `home_team.ilike.%${filters.search}%,away_team.ilike.%${filters.search}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createMatch(
  match: Omit<Match, "id" | "created_by" | "created_at">,
): Promise<Match> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("matches")
    .insert({ ...match, created_by: user.id })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateMatch(
  id: string,
  updates: Partial<Omit<Match, "id" | "created_by" | "created_at">>,
): Promise<Match> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("matches")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteMatch(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("matches").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors.

**Step 3: Commit**

```bash
git add lib/actions/matches.ts
git commit -m "feat: add server actions for match upsert, CRUD, and filtered queries"
```

---

### Task 15: Add shadcn/ui Components

**Step 1: Add missing shadcn components**

Run: `npx shadcn@latest add table dialog select separator`

Follow prompts, accept defaults.

**Step 2: Verify components exist**

Run: `ls components/ui/table.tsx components/ui/dialog.tsx components/ui/select.tsx components/ui/separator.tsx`
Expected: All files listed.

**Step 3: Commit**

```bash
git add components/ui/
git commit -m "chore: add shadcn/ui table, dialog, select, separator components"
```

---

### Task 16: Settings Page — Managed Teams List Component

**Files:**

- Create: `components/settings/managed-teams-list.tsx`

**Step 1: Write the component**

This is a client component that shows managed teams in a table with inline add/edit/delete.

```tsx
"use client";

import { useState } from "react";
import type { ManagedTeam } from "@/lib/types/domain";
import {
  createManagedTeam,
  updateManagedTeam,
  deleteManagedTeam,
} from "@/lib/actions/managed-teams";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Pencil, Plus, Check, X } from "lucide-react";

const LEVEL_LABELS: Record<number, string> = {
  1: "Any",
  2: "Experienced",
  3: "Top",
};

const LEVEL_VARIANTS: Record<number, "default" | "secondary" | "destructive"> =
  {
    1: "secondary",
    2: "default",
    3: "destructive",
  };

export function ManagedTeamsList({
  initialTeams,
}: {
  initialTeams: ManagedTeam[];
}) {
  const [teams, setTeams] = useState<ManagedTeam[]>(initialTeams);
  const [newName, setNewName] = useState("");
  const [newLevel, setNewLevel] = useState<"1" | "2" | "3">("1");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLevel, setEditLevel] = useState<"1" | "2" | "3">("1");
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const team = await createManagedTeam(
        newName.trim(),
        Number(newLevel) as 1 | 2 | 3,
      );
      setTeams((prev) =>
        [...prev, team].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setNewName("");
      setNewLevel("1");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!editName.trim()) return;
    setLoading(true);
    try {
      const updated = await updateManagedTeam(
        id,
        editName.trim(),
        Number(editLevel) as 1 | 2 | 3,
      );
      setTeams((prev) =>
        prev
          .map((t) => (t.id === id ? updated : t))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingId(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setLoading(true);
    try {
      await deleteManagedTeam(id);
      setTeams((prev) => prev.filter((t) => t.id !== id));
    } finally {
      setLoading(false);
    }
  }

  function startEdit(team: ManagedTeam) {
    setEditingId(team.id);
    setEditName(team.name);
    setEditLevel(String(team.required_level) as "1" | "2" | "3");
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team Name</TableHead>
            <TableHead className="w-40">Required Level</TableHead>
            <TableHead className="w-24">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.map((team) => (
            <TableRow key={team.id}>
              {editingId === team.id ? (
                <>
                  <TableCell>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleUpdate(team.id)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={editLevel}
                      onValueChange={(v) => setEditLevel(v as "1" | "2" | "3")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 — Any</SelectItem>
                        <SelectItem value="2">2 — Experienced</SelectItem>
                        <SelectItem value="3">3 — Top</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleUpdate(team.id)}
                        disabled={loading}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </>
              ) : (
                <>
                  <TableCell>{team.name}</TableCell>
                  <TableCell>
                    <Badge variant={LEVEL_VARIANTS[team.required_level]}>
                      {team.required_level} —{" "}
                      {LEVEL_LABELS[team.required_level]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => startEdit(team)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDelete(team.id)}
                        disabled={loading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </>
              )}
            </TableRow>
          ))}

          {/* Add new row */}
          <TableRow>
            <TableCell>
              <Input
                placeholder="Team name (e.g. Heren 01)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </TableCell>
            <TableCell>
              <Select
                value={newLevel}
                onValueChange={(v) => setNewLevel(v as "1" | "2" | "3")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Any</SelectItem>
                  <SelectItem value="2">2 — Experienced</SelectItem>
                  <SelectItem value="3">3 — Top</SelectItem>
                </SelectContent>
              </Select>
            </TableCell>
            <TableCell>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleAdd}
                disabled={loading || !newName.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors.

**Step 3: Commit**

```bash
git add components/settings/managed-teams-list.tsx
git commit -m "feat: add ManagedTeamsList component with inline CRUD"
```

---

### Task 17: Settings Page Route

**Files:**

- Create: `app/protected/settings/page.tsx`

**Step 1: Write the page**

```tsx
import { getManagedTeams } from "@/lib/actions/managed-teams";
import { ManagedTeamsList } from "@/components/settings/managed-teams-list";

export default async function SettingsPage() {
  const teams = await getManagedTeams();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure which teams you manage. Only matches for these teams will be
          imported from uploaded schedules.
        </p>
      </div>
      <div>
        <h2 className="text-lg font-semibold mb-4">Managed Teams</h2>
        <ManagedTeamsList initialTeams={teams} />
      </div>
    </div>
  );
}
```

**Step 2: Run build to verify**

Run: `npm run build`
Expected: Build succeeds (page may warn about env vars, that's OK).

**Step 3: Commit**

```bash
git add app/protected/settings/page.tsx
git commit -m "feat: add settings page with managed teams configuration"
```

---

### Task 18: Upload Zone Component

**Files:**

- Create: `components/matches/upload-zone.tsx`

**Step 1: Write the component**

```tsx
"use client";

import { useCallback, useState } from "react";
import { parseCSV } from "@/lib/parsers/csv";
import { parseExcel } from "@/lib/parsers/excel";
import { parsePaste } from "@/lib/parsers/paste";
import { mapKNHBRows } from "@/lib/parsers/knhb-mapper";
import { upsertMatches } from "@/lib/actions/matches";
import type { ManagedTeam } from "@/lib/types/domain";
import type { ParseResult } from "@/lib/parsers/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, ClipboardPaste } from "lucide-react";

export function UploadZone({
  managedTeams,
  onImportComplete,
}: {
  managedTeams: ManagedTeam[];
  onImportComplete: () => void;
}) {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    inserted: number;
    updated: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const processRows = useCallback(
    (rows: Record<string, string>[]) => {
      const result = mapKNHBRows(rows, { managedTeams });
      setParseResult(result);
      setImportResult(null);
    },
    [managedTeams],
  );

  async function handleFile(file: File) {
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      const buffer = await file.arrayBuffer();
      const rows = parseExcel(buffer);
      processRows(rows);
    } else {
      const text = await file.text();
      const rows = parseCSV(text);
      processRows(rows);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function handlePaste() {
    if (!pasteText.trim()) return;
    const rows = parsePaste(pasteText);
    processRows(rows);
    setShowPaste(false);
    setPasteText("");
  }

  async function handleImport() {
    if (!parseResult || parseResult.matches.length === 0) return;
    setImporting(true);
    try {
      const result = await upsertMatches(parseResult.matches);
      setImportResult(result);
      setParseResult(null);
      onImportComplete();
    } finally {
      setImporting(false);
    }
  }

  function handleReset() {
    setParseResult(null);
    setImportResult(null);
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <Card
        className={`border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center gap-3">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">Drop a CSV or Excel file here</p>
            <p className="text-sm text-muted-foreground">
              Or use the buttons below
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <label className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" />
                Choose File
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </label>
            </Button>
            <Button variant="outline" onClick={() => setShowPaste(!showPaste)}>
              <ClipboardPaste className="mr-2 h-4 w-4" />
              Paste
            </Button>
          </div>
        </div>
      </Card>

      {/* Paste textarea */}
      {showPaste && (
        <div className="space-y-2">
          <textarea
            className="w-full h-32 rounded-md border bg-background p-3 text-sm font-mono"
            placeholder="Paste spreadsheet data here (tab or semicolon separated)..."
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={handlePaste} disabled={!pasteText.trim()}>
              Parse
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowPaste(false);
                setPasteText("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Parse result preview */}
      {parseResult && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {parseResult.matches.length} match
                {parseResult.matches.length !== 1 ? "es" : ""} ready to import
              </p>
              {parseResult.skippedCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  {parseResult.skippedCount} skipped (not in managed teams)
                </p>
              )}
              {parseResult.errors.length > 0 && (
                <p className="text-sm text-destructive">
                  {parseResult.errors.length} error
                  {parseResult.errors.length !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleImport}
                disabled={importing || parseResult.matches.length === 0}
              >
                {importing ? "Importing..." : "Import"}
              </Button>
              <Button variant="ghost" onClick={handleReset}>
                Cancel
              </Button>
            </div>
          </div>
          {parseResult.errors.length > 0 && (
            <ul className="text-sm text-destructive space-y-1">
              {parseResult.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Import result */}
      {importResult && (
        <Card className="p-4">
          <p className="text-sm">
            Import complete: {importResult.inserted} new, {importResult.updated}{" "}
            updated.
          </p>
        </Card>
      )}
    </div>
  );
}
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors.

**Step 3: Commit**

```bash
git add components/matches/upload-zone.tsx
git commit -m "feat: add UploadZone component with drag-drop, file picker, and paste support"
```

---

### Task 19: Match Table Component

**Files:**

- Create: `components/matches/match-table.tsx`

**Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import type { Match } from "@/lib/types/domain";
import { deleteMatch } from "@/lib/actions/matches";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

const LEVEL_LABELS: Record<number, string> = {
  1: "Any",
  2: "Experienced",
  3: "Top",
};

const LEVEL_VARIANTS: Record<number, "default" | "secondary" | "destructive"> =
  {
    1: "secondary",
    2: "default",
    3: "destructive",
  };

function formatTime(startTime: string | null): string {
  if (!startTime) return "—";
  const date = new Date(startTime);
  return date.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function groupByDate(matches: Match[]): Map<string, Match[]> {
  const groups = new Map<string, Match[]>();
  for (const match of matches) {
    const group = groups.get(match.date) ?? [];
    group.push(match);
    groups.set(match.date, group);
  }
  return groups;
}

export function MatchTable({
  matches,
  onEdit,
  onDeleted,
}: {
  matches: Match[];
  onEdit: (match: Match) => void;
  onDeleted: () => void;
}) {
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(new Set());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const groups = groupByDate(matches);

  function toggleDate(date: string) {
    setCollapsedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteMatch(id);
      onDeleted();
    } finally {
      setDeletingId(null);
    }
  }

  if (matches.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No matches yet. Upload a schedule or add a match manually.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Time</TableHead>
          <TableHead>Home</TableHead>
          <TableHead>Away</TableHead>
          <TableHead>Field</TableHead>
          <TableHead>Venue</TableHead>
          <TableHead className="w-32">Level</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...groups.entries()].map(([date, dateMatches]) => {
          const collapsed = collapsedDates.has(date);
          return (
            <>
              {/* Date group header */}
              <TableRow
                key={`date-${date}`}
                className="bg-muted/50 cursor-pointer hover:bg-muted"
                onClick={() => toggleDate(date)}
              >
                <TableCell colSpan={7} className="font-semibold">
                  <div className="flex items-center gap-2">
                    {collapsed ? (
                      <ChevronRight className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                    {formatDate(date)}
                    <span className="text-muted-foreground font-normal text-sm">
                      ({dateMatches.length} match
                      {dateMatches.length !== 1 ? "es" : ""})
                    </span>
                  </div>
                </TableCell>
              </TableRow>

              {/* Match rows */}
              {!collapsed &&
                dateMatches.map((match) => (
                  <TableRow key={match.id}>
                    <TableCell className="font-mono">
                      {formatTime(match.start_time)}
                    </TableCell>
                    <TableCell>{match.home_team}</TableCell>
                    <TableCell>{match.away_team}</TableCell>
                    <TableCell>{match.field ?? "—"}</TableCell>
                    <TableCell>{match.venue ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={LEVEL_VARIANTS[match.required_level]}>
                        {match.required_level} —{" "}
                        {LEVEL_LABELS[match.required_level]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(match)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(match.id)}
                            disabled={deletingId === match.id}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
            </>
          );
        })}
      </TableBody>
    </Table>
  );
}
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors.

**Step 3: Commit**

```bash
git add components/matches/match-table.tsx
git commit -m "feat: add MatchTable component grouped by date with collapsible sections"
```

---

### Task 20: Match Form Dialog Component

**Files:**

- Create: `components/matches/match-form.tsx`

**Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import type { Match } from "@/lib/types/domain";
import { createMatch, updateMatch } from "@/lib/actions/matches";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function MatchFormDialog({
  match,
  open,
  onOpenChange,
  onSaved,
}: {
  match: Match | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEditing = match !== null;

  const [date, setDate] = useState(match?.date ?? "");
  const [startTime, setStartTime] = useState(
    match?.start_time
      ? new Date(match.start_time).toLocaleTimeString("nl-NL", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "",
  );
  const [homeTeam, setHomeTeam] = useState(match?.home_team ?? "");
  const [awayTeam, setAwayTeam] = useState(match?.away_team ?? "");
  const [venue, setVenue] = useState(match?.venue ?? "");
  const [field, setField] = useState(match?.field ?? "");
  const [competition, setCompetition] = useState(match?.competition ?? "");
  const [requiredLevel, setRequiredLevel] = useState<string>(
    String(match?.required_level ?? 1),
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !homeTeam || !awayTeam) return;

    setSaving(true);
    try {
      const matchData = {
        date,
        start_time: startTime ? `${date}T${startTime}:00` : null,
        home_team: homeTeam,
        away_team: awayTeam,
        venue: venue || null,
        field: field || null,
        competition: competition || null,
        required_level: Number(requiredLevel) as 1 | 2 | 3,
      };

      if (isEditing) {
        await updateMatch(match.id, matchData);
      } else {
        await createMatch(matchData);
      }
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Match" : "Add Match"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="home">Home Team</Label>
              <Input
                id="home"
                value={homeTeam}
                onChange={(e) => setHomeTeam(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="away">Away Team</Label>
              <Input
                id="away"
                value={awayTeam}
                onChange={(e) => setAwayTeam(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="field">Field</Label>
              <Input
                id="field"
                value={field}
                onChange={(e) => setField(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venue">Venue</Label>
              <Input
                id="venue"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="competition">Competition</Label>
              <Input
                id="competition"
                value={competition}
                onChange={(e) => setCompetition(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="level">Required Level</Label>
              <Select value={requiredLevel} onValueChange={setRequiredLevel}>
                <SelectTrigger id="level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Any</SelectItem>
                  <SelectItem value="2">2 — Experienced</SelectItem>
                  <SelectItem value="3">3 — Top</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : isEditing ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors.

**Step 3: Commit**

```bash
git add components/matches/match-form.tsx
git commit -m "feat: add MatchFormDialog for creating and editing matches"
```

---

### Task 21: Matches Page

**Files:**

- Create: `app/protected/matches/page.tsx`

**Step 1: Write the page (server component wrapper + client island)**

Create the client component that ties everything together:

Create: `components/matches/matches-page-client.tsx`

```tsx
"use client";

import { useState, useCallback } from "react";
import type { Match, ManagedTeam } from "@/lib/types/domain";
import type { MatchFilters } from "@/lib/actions/matches";
import { getMatches } from "@/lib/actions/matches";
import { UploadZone } from "./upload-zone";
import { MatchTable } from "./match-table";
import { MatchFormDialog } from "./match-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

export function MatchesPageClient({
  initialMatches,
  managedTeams,
}: {
  initialMatches: Match[];
  managedTeams: ManagedTeam[];
}) {
  const [matches, setMatches] = useState(initialMatches);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const refreshMatches = useCallback(async () => {
    const filters: MatchFilters = {};
    if (search) filters.search = search;
    if (levelFilter !== "all")
      filters.requiredLevel = Number(levelFilter) as 1 | 2 | 3;
    const data = await getMatches(filters);
    setMatches(data);
  }, [search, levelFilter]);

  async function handleSearchChange(value: string) {
    setSearch(value);
    const filters: MatchFilters = {};
    if (value) filters.search = value;
    if (levelFilter !== "all")
      filters.requiredLevel = Number(levelFilter) as 1 | 2 | 3;
    const data = await getMatches(filters);
    setMatches(data);
  }

  async function handleLevelChange(value: string) {
    setLevelFilter(value);
    const filters: MatchFilters = {};
    if (search) filters.search = search;
    if (value !== "all") filters.requiredLevel = Number(value) as 1 | 2 | 3;
    const data = await getMatches(filters);
    setMatches(data);
  }

  return (
    <div className="flex flex-col gap-6">
      <UploadZone
        managedTeams={managedTeams}
        onImportComplete={refreshMatches}
      />

      {/* Filters + Add button */}
      <div className="flex items-center gap-4">
        <Input
          placeholder="Search teams..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="max-w-xs"
        />
        <Select value={levelFilter} onValueChange={handleLevelChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filter by level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            <SelectItem value="1">1 — Any</SelectItem>
            <SelectItem value="2">2 — Experienced</SelectItem>
            <SelectItem value="3">3 — Top</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto">
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Match
          </Button>
        </div>
      </div>

      <MatchTable
        matches={matches}
        onEdit={(match) => setEditingMatch(match)}
        onDeleted={refreshMatches}
      />

      {/* Add dialog */}
      <MatchFormDialog
        match={null}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSaved={refreshMatches}
      />

      {/* Edit dialog */}
      {editingMatch && (
        <MatchFormDialog
          match={editingMatch}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingMatch(null);
          }}
          onSaved={refreshMatches}
        />
      )}
    </div>
  );
}
```

Then the server page:

Create: `app/protected/matches/page.tsx`

```tsx
import { getMatches } from "@/lib/actions/matches";
import { getManagedTeams } from "@/lib/actions/managed-teams";
import { MatchesPageClient } from "@/components/matches/matches-page-client";

export default async function MatchesPage() {
  const [matches, managedTeams] = await Promise.all([
    getMatches(),
    getManagedTeams(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Matches</h1>
        <p className="text-muted-foreground">
          Upload match schedules and manage individual matches.
        </p>
      </div>
      <MatchesPageClient initialMatches={matches} managedTeams={managedTeams} />
    </div>
  );
}
```

**Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors.

**Step 3: Commit**

```bash
git add components/matches/matches-page-client.tsx app/protected/matches/page.tsx
git commit -m "feat: add matches page with upload, filters, and CRUD"
```

---

### Task 22: Add Navigation Links

**Files:**

- Modify: `app/protected/layout.tsx`

**Step 1: Add nav links to matches and settings**

In the existing `<nav>` section, add links to `/protected/matches` and `/protected/settings` next to the existing content. Replace the `<Link href={"/"}>Next.js Supabase Starter</Link>` and `<DeployButton />` section with:

```tsx
<div className="flex gap-5 items-center font-semibold">
  <Link href="/protected">Fluitplanner</Link>
  <div className="flex items-center gap-4 text-sm font-normal">
    <Link href="/protected/matches" className="hover:underline">
      Matches
    </Link>
    <Link href="/protected/settings" className="hover:underline">
      Settings
    </Link>
  </div>
</div>
```

Remove the `DeployButton` import and usage.

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds.

**Step 3: Commit**

```bash
git add app/protected/layout.tsx
git commit -m "feat: add navigation links to matches and settings pages"
```

---

### Task 23: Run Full Test Suite + Lint + Build

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass.

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

**Step 3: Run format check**

Run: `npm run format:check`
Expected: All files formatted (or run `npm run format` to fix).

**Step 4: Run type check**

Run: `npm run type-check`
Expected: No type errors.

**Step 5: Run build**

Run: `npm run build`
Expected: Build succeeds.

---

### Task 24: Apply Migration to Remote Supabase

**Step 1: Dry run**

Run: `npx supabase db push --dry-run`
Expected: Shows the new migration would be applied.

**Step 2: Apply**

Run: `npx supabase db push`
Expected: Migration applied successfully.

---

### Task 25: Manual Smoke Test

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test settings page**

1. Navigate to `http://localhost:3000/protected/settings`
2. Add a managed team (e.g., "Heren 01" with level 3)
3. Add another (e.g., "Dames 01" with level 2)
4. Edit a team's level
5. Delete a team

**Step 3: Test match upload**

1. Navigate to `http://localhost:3000/protected/matches`
2. Upload the KNHB CSV file (`/tmp/Wedstrijdschema_HIC (8).csv`)
3. Verify only managed teams' matches appear in the preview count
4. Click Import
5. Verify matches appear grouped by date in the table

**Step 4: Test match CRUD**

1. Add a match manually via the Add Match button
2. Edit an existing match
3. Delete a match

**Step 5: Test re-import**

1. Upload the same CSV again
2. Verify the counts show updates instead of new inserts
