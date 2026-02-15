# Matches Page Improvements Design

Two sprints: date range filtering and advanced import.

## Sprint 1: Date Range Filter

### Problem

The matches page shows all matches with no date scoping. Users typically care about upcoming matches, not historical ones. The server action already supports `dateFrom`/`dateTo` filters but they are not exposed in the UI.

### Design

Add a date range picker to the existing filter bar. Default range: today → today + 2 months.

**UI layout:** `[Search] [Level] [Date Range ▾] ........... [+ Add]`

The date range button shows the selected range as text (e.g. "15 Feb – 15 Apr"). Clicking opens a popover with:

- **Preset buttons** at the top: "This week", "Next 2 weeks", "This month", "Next 2 months" (default), "Past month", "All"
- **Dual-month calendar** below for custom range selection

**Behavior:**

- Page loads with default range (today → today+2mo) — initial SSR fetch uses this range
- "All" preset clears both dates, showing everything
- Changing the range triggers `getMatches()` with updated `dateFrom`/`dateTo`
- On mobile: filter row wraps, date range picker goes full-width

**New shadcn components:** `popover`, `calendar`

**i18n:** New keys under `"matches"` namespace for preset labels and "dateRange" label.

### Files changed

- `components/matches/matches-page-client.tsx` — add date range state, wire into filters
- `components/matches/date-range-picker.tsx` — new component (popover + calendar + presets)
- `app/protected/matches/page.tsx` — pass default date range to initial `getMatches()` call
- `messages/en.json`, `messages/nl.json` — new translation keys

---

## Sprint 2: Advanced Import

### Problem

The import flow only imports matches for managed teams. Users sometimes want to import matches for additional teams from the same file without first adding them to managed teams.

### Design

Add a toggle in the upload zone: "Quick import" (default, current behavior) vs "Advanced import".

**Quick mode (unchanged):**
File → parse → KNHB mapper (managed teams only) → preview → import

**Advanced mode:**
File → parse → extract unique home teams → **team selector** → KNHB mapper (selected teams) → preview → import → **"Add to managed?" prompt**

#### Team Selector component

New `TeamSelector` component shown between parse and preview in advanced mode:

- Lists all unique home team names from the parsed file
- Each team has a checkbox
- Managed teams: pre-checked, with a "Managed" badge
- Non-managed teams: unchecked by default
- "Select all" / "Deselect all" convenience buttons
- Count summary: "12 teams in file, 4 managed, 8 additional"
- "Continue" button proceeds to existing preview step

#### Post-import "Add to managed" dialog

Shown after successful import if non-managed teams were selected:

- Lists the newly selected non-managed teams
- Each with a level dropdown (defaults to 1)
- "Add to managed teams" button calls `batchCreateManagedTeams` for all selected teams at once
- "Skip" dismisses without adding

#### Mapper changes

- `MapperOptions` gets optional `selectedTeams?: string[]`
- When provided, filter by `selectedTeams` instead of `managedTeams`
- For teams not in managed list, `required_level` defaults to 1
- New `extractHomeTeams(rows: RawRow[]): string[]` utility function

### Files changed

- `components/matches/upload-zone.tsx` — add mode toggle, integrate team selector step
- `components/matches/team-selector.tsx` — new component
- `components/matches/add-to-managed-dialog.tsx` — new component
- `lib/parsers/knhb-mapper.ts` — accept `selectedTeams` option, add `extractHomeTeams`
- `lib/parsers/types.ts` — update `MapperOptions`
- `lib/actions/managed-teams.ts` — batch add action (if not already present)
- `messages/en.json`, `messages/nl.json` — new translation keys
