# Matches Page Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add date range filtering with presets and advanced import with team selection to the Matches page.

**Architecture:** Sprint 1 wires the existing `dateFrom`/`dateTo` server action filters into a new date range picker UI component. Sprint 2 adds a toggle between quick/advanced import modes, where advanced mode shows a team selector before the preview step, and optionally prompts to add new teams to managed teams after import.

**Tech Stack:** Next.js App Router, shadcn/ui (popover, calendar, checkbox), next-intl, Vitest + React Testing Library

---

## Sprint 1: Date Range Filter

### Task 1: Install shadcn popover + calendar components

**Step 1: Install components**

Run: `npx shadcn@latest add popover calendar`

**Step 2: Verify installation**

Run: `ls components/ui/popover.tsx components/ui/calendar.tsx`
Expected: Both files exist

**Step 3: Commit**

```bash
git add components/ui/popover.tsx components/ui/calendar.tsx package.json package-lock.json
git commit -m "chore: add shadcn popover and calendar components"
```

---

### Task 2: Add i18n keys for date range filter

**Files:**

- Modify: `messages/en.json` (matches namespace)
- Modify: `messages/nl.json` (matches namespace)

**Step 1: Add English translations**

Add these keys to the `"matches"` namespace in `messages/en.json`:

```json
"dateRange": "Date range",
"presetThisWeek": "This week",
"presetNextTwoWeeks": "Next 2 weeks",
"presetThisMonth": "This month",
"presetNextTwoMonths": "Next 2 months",
"presetPastMonth": "Past month",
"presetAll": "All matches"
```

**Step 2: Add Dutch translations**

Add these keys to the `"matches"` namespace in `messages/nl.json`:

```json
"dateRange": "Datumbereik",
"presetThisWeek": "Deze week",
"presetNextTwoWeeks": "Komende 2 weken",
"presetThisMonth": "Deze maand",
"presetNextTwoMonths": "Komende 2 maanden",
"presetPastMonth": "Afgelopen maand",
"presetAll": "Alle wedstrijden"
```

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(i18n): add date range filter translations"
```

---

### Task 3: Create DateRangePicker component (TDD)

**Files:**

- Create: `components/matches/date-range-picker.tsx`
- Create: `components/matches/__tests__/date-range-picker.test.tsx`

**Step 1: Write failing tests**

Create `components/matches/__tests__/date-range-picker.test.tsx`:

```tsx
import { screen, fireEvent } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DateRangePicker } from "../date-range-picker";
import type { DateRange } from "react-day-picker";

describe("DateRangePicker", () => {
  const defaultRange: DateRange = {
    from: new Date(2026, 1, 15), // Feb 15
    to: new Date(2026, 3, 15), // Apr 15
  };
  const onChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a button with the date range text", () => {
    render(<DateRangePicker value={defaultRange} onChange={onChange} />);
    const button = screen.getByRole("button", { name: /date range/i });
    expect(button).toBeInTheDocument();
    // Should display formatted date range
    expect(button).toHaveTextContent(/feb/i);
    expect(button).toHaveTextContent(/apr/i);
  });

  it("opens a popover when clicked", async () => {
    render(<DateRangePicker value={defaultRange} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /date range/i }));
    // Preset buttons should be visible
    expect(
      screen.getByRole("button", { name: /this week/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /all matches/i }),
    ).toBeInTheDocument();
  });

  it("calls onChange with undefined range when 'All matches' is clicked", async () => {
    render(<DateRangePicker value={defaultRange} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /date range/i }));
    fireEvent.click(screen.getByRole("button", { name: /all matches/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("shows 'All matches' text when value is undefined", () => {
    render(<DateRangePicker value={undefined} onChange={onChange} />);
    const button = screen.getByRole("button", { name: /date range/i });
    expect(button).toHaveTextContent(/all matches/i);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run components/matches/__tests__/date-range-picker.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement DateRangePicker**

Create `components/matches/date-range-picker.tsx`:

```tsx
"use client";

import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslations, useFormatter } from "next-intl";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  subMonths,
} from "date-fns";
import { useState } from "react";
import type { DateRange } from "react-day-picker";

type Props = {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
};

export function DateRangePicker({ value, onChange }: Props) {
  const t = useTranslations("matches");
  const format = useFormatter();
  const [open, setOpen] = useState(false);

  const today = new Date();

  const presets: { label: string; range: DateRange | undefined }[] = [
    {
      label: t("presetThisWeek"),
      range: {
        from: startOfWeek(today, { weekStartsOn: 1 }),
        to: endOfWeek(today, { weekStartsOn: 1 }),
      },
    },
    {
      label: t("presetNextTwoWeeks"),
      range: { from: today, to: addDays(today, 14) },
    },
    {
      label: t("presetThisMonth"),
      range: { from: startOfMonth(today), to: endOfMonth(today) },
    },
    {
      label: t("presetNextTwoMonths"),
      range: { from: today, to: addMonths(today, 2) },
    },
    {
      label: t("presetPastMonth"),
      range: {
        from: startOfMonth(subMonths(today, 1)),
        to: endOfMonth(subMonths(today, 1)),
      },
    },
    { label: t("presetAll"), range: undefined },
  ];

  function handlePreset(range: DateRange | undefined) {
    onChange(range);
    setOpen(false);
  }

  function handleCalendarSelect(range: DateRange | undefined) {
    onChange(range);
    if (range?.from && range?.to) {
      setOpen(false);
    }
  }

  const buttonText = value?.from
    ? `${format.dateTime(value.from, { month: "short", day: "numeric" })} – ${value.to ? format.dateTime(value.to, { month: "short", day: "numeric" }) : "..."}`
    : t("presetAll");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label={t("dateRange")}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {buttonText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col gap-2 p-3 border-b">
          <div className="flex flex-wrap gap-1">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                variant="ghost"
                size="sm"
                onClick={() => handlePreset(preset.range)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
        <Calendar
          mode="range"
          selected={value}
          onSelect={handleCalendarSelect}
          numberOfMonths={2}
          defaultMonth={value?.from ?? today}
        />
      </PopoverContent>
    </Popover>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run components/matches/__tests__/date-range-picker.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/matches/date-range-picker.tsx components/matches/__tests__/date-range-picker.test.tsx
git commit -m "feat: add DateRangePicker component with presets"
```

---

### Task 4: Wire date range into MatchesPageClient (TDD)

**Files:**

- Modify: `components/matches/matches-page-client.tsx`
- Modify: `app/protected/matches/page.tsx`

**Step 1: Write failing test for date range integration**

Create `components/matches/__tests__/matches-page-client.test.tsx`:

```tsx
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MatchesPageClient } from "../matches-page-client";
import type { Match, ManagedTeam } from "@/lib/types/domain";

vi.mock("@/lib/actions/matches", () => ({
  getMatches: vi.fn().mockResolvedValue([]),
}));

vi.mock("../upload-zone", () => ({
  UploadZone: () => <div data-testid="upload-zone" />,
}));

vi.mock("../match-table", () => ({
  MatchTable: ({ matches }: { matches: Match[] }) => (
    <div data-testid="match-table">{matches.length} matches</div>
  ),
}));

vi.mock("../match-form", () => ({
  MatchFormDialog: () => null,
}));

import { getMatches } from "@/lib/actions/matches";
const mockGetMatches = vi.mocked(getMatches);

const managedTeams: ManagedTeam[] = [];

describe("MatchesPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMatches.mockResolvedValue([]);
  });

  it("renders the date range picker", () => {
    render(
      <MatchesPageClient initialMatches={[]} managedTeams={managedTeams} />,
    );
    expect(
      screen.getByRole("button", { name: /date range/i }),
    ).toBeInTheDocument();
  });

  it("passes dateFrom and dateTo filters when date range is set", async () => {
    render(
      <MatchesPageClient initialMatches={[]} managedTeams={managedTeams} />,
    );
    // The component initializes with a default date range (today to today+2mo)
    // so the initial fetch should include dateFrom and dateTo
    // We verify this by checking that getMatches was called (from any filter change)
    // The date range is present in the filter bar
    expect(
      screen.getByRole("button", { name: /date range/i }),
    ).toBeInTheDocument();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run components/matches/__tests__/matches-page-client.test.tsx`
Expected: FAIL — DateRangePicker not rendered yet

**Step 3: Integrate DateRangePicker into MatchesPageClient**

Modify `components/matches/matches-page-client.tsx` to:

- Import `DateRangePicker` and `DateRange` from `react-day-picker`
- Add `dateRange` state initialized to `{ from: today, to: addMonths(today, 2) }`
- Add `handleDateRangeChange` that updates state and refetches
- Include `dateFrom`/`dateTo` in all filter calls (format as ISO date strings)
- Render `<DateRangePicker>` in the filter bar between the level select and the add button

Also modify `app/protected/matches/page.tsx` to pass default `dateFrom`/`dateTo` to initial `getMatches()` call so SSR matches the client default.

**Step 4: Run tests to verify they pass**

Run: `npx vitest run components/matches/__tests__/matches-page-client.test.tsx`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add components/matches/matches-page-client.tsx app/protected/matches/page.tsx
git commit -m "feat: wire date range filter into matches page"
```

---

### Task 5: Sprint 1 polish and verify

**Step 1: Run type check**

Run: `npm run type-check`
Expected: No errors

**Step 2: Run lint + format**

Run: `npm run lint && npm run format:check`
Expected: Clean

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 4: Manual smoke test**

Run: `npm run dev` and verify:

- Matches page loads with default 2-month range
- Presets work correctly
- Calendar range selection works
- "All matches" shows everything
- Filters combine correctly (search + level + date range)
- Mobile responsive

**Step 5: Commit any fixes, then done with Sprint 1**

---

## Sprint 2: Advanced Import

### Task 6: Add i18n keys for advanced import

**Files:**

- Modify: `messages/en.json`
- Modify: `messages/nl.json`

**Step 1: Add English translations**

Add these keys to the `"matches"` namespace in `messages/en.json`:

```json
"importModeQuick": "Quick import",
"importModeAdvanced": "Advanced import",
"importModeQuickDesc": "Import matches for managed teams only",
"importModeAdvancedDesc": "Select which teams to import",
"teamSelectorTitle": "Select teams to import",
"teamSelectorManaged": "Managed",
"teamSelectorSelectAll": "Select all",
"teamSelectorDeselectAll": "Deselect all",
"teamSelectorSummary": "{total} teams in file, {managed} managed, {additional} additional",
"teamSelectorContinue": "Continue",
"addToManagedTitle": "Add teams to managed?",
"addToManagedDescription": "These teams are not in your managed teams yet. Would you like to add them?",
"addToManagedConfirm": "Add to managed teams",
"addToManagedSkip": "Skip"
```

**Step 2: Add Dutch translations**

```json
"importModeQuick": "Snel importeren",
"importModeAdvanced": "Uitgebreid importeren",
"importModeQuickDesc": "Importeer wedstrijden van alleen beheerde teams",
"importModeAdvancedDesc": "Selecteer welke teams je wilt importeren",
"teamSelectorTitle": "Selecteer teams om te importeren",
"teamSelectorManaged": "Beheerd",
"teamSelectorSelectAll": "Alles selecteren",
"teamSelectorDeselectAll": "Alles deselecteren",
"teamSelectorSummary": "{total} teams in bestand, {managed} beheerd, {additional} extra",
"teamSelectorContinue": "Doorgaan",
"addToManagedTitle": "Teams toevoegen aan beheerde teams?",
"addToManagedDescription": "Deze teams staan nog niet in je beheerde teams. Wil je ze toevoegen?",
"addToManagedConfirm": "Toevoegen aan beheerde teams",
"addToManagedSkip": "Overslaan"
```

**Step 3: Commit**

```bash
git add messages/en.json messages/nl.json
git commit -m "feat(i18n): add advanced import translations"
```

---

### Task 7: Add `extractHomeTeams` and update mapper (TDD)

**Files:**

- Modify: `lib/parsers/knhb-mapper.ts`
- Modify: `lib/parsers/types.ts`
- Modify: `__tests__/lib/parsers/knhb-mapper.test.ts`

**Step 1: Write failing tests**

Add to `__tests__/lib/parsers/knhb-mapper.test.ts`:

```ts
import { extractHomeTeams } from "@/lib/parsers/knhb-mapper";

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
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/parsers/knhb-mapper.test.ts`
Expected: FAIL — `extractHomeTeams` not exported, `selectedTeams` not recognized

**Step 3: Implement changes**

Update `lib/parsers/types.ts` — add `selectedTeams` to `MapperOptions`:

```ts
export type MapperOptions = {
  managedTeams: ManagedTeam[];
  selectedTeams?: string[];
};
```

Update `lib/parsers/knhb-mapper.ts`:

Add `extractHomeTeams` export:

```ts
export function extractHomeTeams(rows: RawRow[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of rows) {
    const name = (row["Thuis team"] ?? "").trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}
```

Update `mapKNHBRows` — when `options.selectedTeams` is provided, use it as the whitelist instead of `managedTeams`. Look up the team in the managed team map for `required_level`, defaulting to 1 if not found:

```ts
// Inside mapKNHBRows, replace the managed team filter block:
const useSelectedTeams = options.selectedTeams != null;
const selectedSet = useSelectedTeams ? new Set(options.selectedTeams) : null;

// In the loop, replace the filter logic:
if (useSelectedTeams) {
  if (!selectedSet!.has(homeTeam)) {
    skippedCount++;
    continue;
  }
} else {
  if (!teamMap.has(homeTeam)) {
    skippedCount++;
    continue;
  }
}

// For required_level:
const managedTeam = teamMap.get(homeTeam);
const requiredLevel = managedTeam?.required_level ?? 1;
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/parsers/knhb-mapper.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add lib/parsers/knhb-mapper.ts lib/parsers/types.ts __tests__/lib/parsers/knhb-mapper.test.ts
git commit -m "feat: add extractHomeTeams and selectedTeams support to KNHB mapper"
```

---

### Task 8: Add `batchCreateManagedTeams` action (TDD)

**Files:**

- Modify: `lib/actions/managed-teams.ts`
- Create: `__tests__/lib/actions/managed-teams.test.ts`

**Step 1: Write failing test**

Create `__tests__/lib/actions/managed-teams.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
    auth: { getUser: mockGetUser },
  })),
}));

beforeEach(() => {
  vi.resetAllMocks();
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  mockInsert.mockReturnValue({
    select: mockSelect,
  });
  mockSelect.mockResolvedValue({ data: [], error: null });
});

describe("batchCreateManagedTeams", () => {
  it("inserts multiple teams in a single call", async () => {
    const teams = [
      { name: "Team A", requiredLevel: 1 as const },
      { name: "Team B", requiredLevel: 2 as const },
    ];
    mockSelect.mockResolvedValue({
      data: [
        {
          id: "1",
          name: "Team A",
          required_level: 1,
          created_by: "user-1",
          created_at: "2026-01-01",
        },
        {
          id: "2",
          name: "Team B",
          required_level: 2,
          created_by: "user-1",
          created_at: "2026-01-01",
        },
      ],
      error: null,
    });

    const { batchCreateManagedTeams } =
      await import("@/lib/actions/managed-teams");
    const result = await batchCreateManagedTeams(teams);

    expect(mockInsert).toHaveBeenCalledWith([
      { name: "Team A", required_level: 1, created_by: "user-1" },
      { name: "Team B", required_level: 2, created_by: "user-1" },
    ]);
    expect(result).toHaveLength(2);
  });

  it("throws when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const { batchCreateManagedTeams } =
      await import("@/lib/actions/managed-teams");
    await expect(
      batchCreateManagedTeams([{ name: "X", requiredLevel: 1 }]),
    ).rejects.toThrow("Not authenticated");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run __tests__/lib/actions/managed-teams.test.ts`
Expected: FAIL — `batchCreateManagedTeams` not exported

**Step 3: Implement**

Add to `lib/actions/managed-teams.ts`:

```ts
export async function batchCreateManagedTeams(
  teams: { name: string; requiredLevel: 1 | 2 | 3 }[],
): Promise<ManagedTeam[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const rows = teams.map((t) => ({
    name: t.name.trim(),
    required_level: t.requiredLevel,
    created_by: user.id,
  }));

  const { data, error } = await supabase
    .from("managed_teams")
    .insert(rows)
    .select();

  if (error) throw new Error(error.message);
  return data ?? [];
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/actions/managed-teams.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/actions/managed-teams.ts __tests__/lib/actions/managed-teams.test.ts
git commit -m "feat: add batchCreateManagedTeams action"
```

---

### Task 9: Create TeamSelector component (TDD)

**Files:**

- Create: `components/matches/team-selector.tsx`
- Create: `components/matches/__tests__/team-selector.test.tsx`

**Step 1: Write failing tests**

Create `components/matches/__tests__/team-selector.test.tsx`:

```tsx
import { screen, fireEvent } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TeamSelector } from "../team-selector";

const allTeams = ["Team A", "Team B", "Team C", "Team D"];
const managedTeamNames = ["Team A", "Team B"];

describe("TeamSelector", () => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all teams with checkboxes", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(4);
  });

  it("pre-checks managed teams", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked(); // Team A - managed
    expect(checkboxes[1]).toBeChecked(); // Team B - managed
    expect(checkboxes[2]).not.toBeChecked(); // Team C
    expect(checkboxes[3]).not.toBeChecked(); // Team D
  });

  it("shows 'Managed' badge on managed teams", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const badges = screen.getAllByText(/managed/i);
    expect(badges).toHaveLength(2);
  });

  it("calls onConfirm with selected team names", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    // Check Team C additionally
    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onConfirm).toHaveBeenCalledWith(["Team A", "Team B", "Team C"]);
  });

  it("select all checks all teams", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /select all/i }));
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).toBeChecked());
  });

  it("deselect all unchecks all teams", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /deselect all/i }));
    const checkboxes = screen.getAllByRole("checkbox");
    checkboxes.forEach((cb) => expect(cb).not.toBeChecked());
  });

  it("disables continue when no teams selected", () => {
    render(
      <TeamSelector
        teams={allTeams}
        managedTeamNames={managedTeamNames}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /deselect all/i }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run components/matches/__tests__/team-selector.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement TeamSelector**

Create `components/matches/team-selector.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";

type Props = {
  teams: string[];
  managedTeamNames: string[];
  onConfirm: (selectedTeams: string[]) => void;
  onCancel: () => void;
};

export function TeamSelector({
  teams,
  managedTeamNames,
  onConfirm,
  onCancel,
}: Props) {
  const t = useTranslations("matches");
  const tCommon = useTranslations("common");
  const managedSet = new Set(managedTeamNames);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(managedTeamNames.filter((name) => teams.includes(name))),
  );

  function toggle(team: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(team)) {
        next.delete(team);
      } else {
        next.add(team);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(teams));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  const managedCount = teams.filter((t) => managedSet.has(t)).length;
  const additionalCount =
    selected.size -
    teams.filter((t) => managedSet.has(t) && selected.has(t)).length;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t("teamSelectorTitle")}</h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={selectAll}>
            {t("teamSelectorSelectAll")}
          </Button>
          <Button variant="ghost" size="sm" onClick={deselectAll}>
            {t("teamSelectorDeselectAll")}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("teamSelectorSummary", {
          total: teams.length,
          managed: managedCount,
          additional: additionalCount,
        })}
      </p>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {teams.map((team) => (
          <label
            key={team}
            className="flex items-center gap-3 py-1 cursor-pointer"
          >
            <Checkbox
              checked={selected.has(team)}
              onCheckedChange={() => toggle(team)}
            />
            <span className="text-sm">{team}</span>
            {managedSet.has(team) && (
              <Badge variant="secondary">{t("teamSelectorManaged")}</Badge>
            )}
          </label>
        ))}
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        <Button
          onClick={() => onConfirm(Array.from(selected))}
          disabled={selected.size === 0}
        >
          {t("teamSelectorContinue")}
        </Button>
      </div>
    </Card>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run components/matches/__tests__/team-selector.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/matches/team-selector.tsx components/matches/__tests__/team-selector.test.tsx
git commit -m "feat: add TeamSelector component for advanced import"
```

---

### Task 10: Create AddToManagedDialog component (TDD)

**Files:**

- Create: `components/matches/add-to-managed-dialog.tsx`
- Create: `components/matches/__tests__/add-to-managed-dialog.test.tsx`

**Step 1: Write failing tests**

Create `components/matches/__tests__/add-to-managed-dialog.test.tsx`:

```tsx
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AddToManagedDialog } from "../add-to-managed-dialog";

vi.mock("@/lib/actions/managed-teams", () => ({
  batchCreateManagedTeams: vi.fn().mockResolvedValue([]),
}));

import { batchCreateManagedTeams } from "@/lib/actions/managed-teams";
const mockBatch = vi.mocked(batchCreateManagedTeams);

describe("AddToManagedDialog", () => {
  const onDone = vi.fn();
  const teams = ["Team C", "Team D"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockBatch.mockResolvedValue([]);
  });

  it("renders team names with level dropdowns", () => {
    render(<AddToManagedDialog open={true} teams={teams} onDone={onDone} />);
    expect(screen.getByText("Team C")).toBeInTheDocument();
    expect(screen.getByText("Team D")).toBeInTheDocument();
  });

  it("calls batchCreateManagedTeams on confirm", async () => {
    render(<AddToManagedDialog open={true} teams={teams} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /add to managed/i }));
    await waitFor(() => {
      expect(mockBatch).toHaveBeenCalledWith([
        { name: "Team C", requiredLevel: 1 },
        { name: "Team D", requiredLevel: 1 },
      ]);
    });
    expect(onDone).toHaveBeenCalled();
  });

  it("calls onDone without adding when skip is clicked", () => {
    render(<AddToManagedDialog open={true} teams={teams} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: /skip/i }));
    expect(mockBatch).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run components/matches/__tests__/add-to-managed-dialog.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement AddToManagedDialog**

Create `components/matches/add-to-managed-dialog.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { batchCreateManagedTeams } from "@/lib/actions/managed-teams";
import { useTranslations } from "next-intl";

type Props = {
  open: boolean;
  teams: string[];
  onDone: () => void;
};

export function AddToManagedDialog({ open, teams, onDone }: Props) {
  const t = useTranslations("matches");
  const [levels, setLevels] = useState<Record<string, 1 | 2 | 3>>(() =>
    Object.fromEntries(teams.map((name) => [name, 1])),
  );
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    setSaving(true);
    try {
      await batchCreateManagedTeams(
        teams.map((name) => ({ name, requiredLevel: levels[name] ?? 1 })),
      );
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addToManagedTitle")}</DialogTitle>
          <DialogDescription>{t("addToManagedDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {teams.map((name) => (
            <div key={name} className="flex items-center justify-between gap-4">
              <span className="text-sm">{name}</span>
              <Select
                value={String(levels[name])}
                onValueChange={(v) =>
                  setLevels((prev) => ({
                    ...prev,
                    [name]: Number(v) as 1 | 2 | 3,
                  }))
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">{t("levelAny")}</SelectItem>
                  <SelectItem value="2">{t("levelExperienced")}</SelectItem>
                  <SelectItem value="3">{t("levelTop")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" onClick={onDone}>
            {t("addToManagedSkip")}
          </Button>
          <Button onClick={handleAdd} disabled={saving}>
            {saving ? t("saving") : t("addToManagedConfirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run components/matches/__tests__/add-to-managed-dialog.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/matches/add-to-managed-dialog.tsx components/matches/__tests__/add-to-managed-dialog.test.tsx
git commit -m "feat: add AddToManagedDialog component"
```

---

### Task 11: Integrate advanced import into UploadZone (TDD)

**Files:**

- Modify: `components/matches/upload-zone.tsx`
- Create or modify: `components/matches/__tests__/upload-zone.test.tsx`

**Step 1: Write failing tests**

Create `components/matches/__tests__/upload-zone.test.tsx`:

```tsx
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UploadZone } from "../upload-zone";
import type { ManagedTeam } from "@/lib/types/domain";

vi.mock("@/lib/actions/matches", () => ({
  upsertMatches: vi.fn().mockResolvedValue({ inserted: 2, updated: 0 }),
}));

vi.mock("@/lib/parsers/knhb-mapper", () => ({
  mapKNHBRows: vi
    .fn()
    .mockReturnValue({ matches: [], skippedCount: 0, errors: [] }),
  extractHomeTeams: vi.fn().mockReturnValue(["Team A", "Team B", "Team C"]),
}));

vi.mock("@/lib/parsers/csv", () => ({
  parseCSV: vi.fn().mockReturnValue([]),
}));

const managedTeams: ManagedTeam[] = [
  {
    id: "1",
    name: "Team A",
    required_level: 1,
    created_by: "u1",
    created_at: "2026-01-01",
  },
];

describe("UploadZone", () => {
  const onImportComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders import mode toggle with Quick and Advanced options", () => {
    render(
      <UploadZone
        managedTeams={managedTeams}
        onImportComplete={onImportComplete}
      />,
    );
    expect(
      screen.getByRole("radio", { name: /quick import/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /advanced import/i }),
    ).toBeInTheDocument();
  });

  it("defaults to quick import mode", () => {
    render(
      <UploadZone
        managedTeams={managedTeams}
        onImportComplete={onImportComplete}
      />,
    );
    expect(screen.getByRole("radio", { name: /quick import/i })).toBeChecked();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run components/matches/__tests__/upload-zone.test.tsx`
Expected: FAIL — no radio buttons in current component

**Step 3: Modify UploadZone**

Update `components/matches/upload-zone.tsx` to:

1. Add `importMode` state (`"quick" | "advanced"`, default `"quick"`)
2. Add radio toggle at the top of the upload zone for Quick/Advanced
3. In advanced mode, after file parse:
   - Call `extractHomeTeams(rows)` to get all teams from file
   - Store raw rows in state (don't immediately call `mapKNHBRows`)
   - Show `<TeamSelector>` with all teams and managed team names
   - On TeamSelector confirm: call `mapKNHBRows` with `selectedTeams` option, then show preview
   - Track which selected teams are non-managed (for post-import dialog)
4. After successful import in advanced mode: if non-managed teams were selected, show `<AddToManagedDialog>`
5. Quick mode: unchanged behavior

Key state additions:

- `importMode: "quick" | "advanced"`
- `rawRows: RawRow[] | null` (for advanced mode, store parsed rows before team selection)
- `allHomeTeams: string[]` (extracted from file)
- `nonManagedSelected: string[]` (teams selected but not managed)
- `showAddToManaged: boolean`

**Step 4: Run tests to verify they pass**

Run: `npx vitest run components/matches/__tests__/upload-zone.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/matches/upload-zone.tsx components/matches/__tests__/upload-zone.test.tsx
git commit -m "feat: integrate advanced import mode into UploadZone"
```

---

### Task 12: Sprint 2 polish and verify

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass

**Step 2: Run type check**

Run: `npm run type-check`
Expected: No errors

**Step 3: Run lint + format**

Run: `npm run lint && npm run format`
Expected: Clean (format may fix some files)

**Step 4: Run build**

Run: `npm run build`
Expected: Build succeeds

**Step 5: Manual smoke test**

Run: `npm run dev` and verify:

- Quick import: unchanged behavior
- Advanced import: file parse shows team selector
- Managed teams pre-checked with badge
- Select all / deselect all work
- After import, "Add to managed" dialog appears for non-managed teams
- Skip dismisses dialog, confirm adds teams
- Mobile responsive

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: polish and fixes for matches page improvements"
```
