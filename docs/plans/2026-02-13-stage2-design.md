# Stage 2 Design: Match Management (Planner)

## Decisions

- **Data source:** KNHB "Wedstrijdschema" CSV (semicolon-delimited, Dutch headers, DD-MM-YYYY dates). Also support Excel (.xlsx) and copy-paste.
- **Team filtering:** Planner configures managed teams in a settings page. On import, only matches where `Thuis team` matches a managed team are imported.
- **Duplicate handling:** Upsert — matches identified by `(date, home_team, away_team, created_by)`. Re-importing updates existing matches.
- **Required level:** 3-tier system (1/2/3). Configured per managed team, inherited by matches on import, editable per match.
- **UI framework:** shadcn/ui components exclusively (Table, Dialog, Button, Input, Select, Badge, DropdownMenu, Card).
- **Parsing:** Client-side with Papa Parse (CSV/paste) and SheetJS (Excel). Instant preview before server commit.

---

## Schema Changes

### New table: `managed_teams`

| Column           | Type                     | Notes                              |
| ---------------- | ------------------------ | ---------------------------------- |
| `id`             | `uuid` PK                | Default `gen_random_uuid()`        |
| `name`           | `text` NOT NULL          | Team name as it appears in the CSV |
| `required_level` | `integer` NOT NULL       | 1 (any), 2 (experienced), 3 (top)  |
| `created_by`     | `uuid` FK → `auth.users` |                                    |
| `created_at`     | `timestamptz`            | Default `now()`                    |
| UNIQUE           |                          | `(name, created_by)`               |

### Alter `matches` table

Add columns:

- `field text` — from CSV `Veld` column (e.g., "V1", "KG1")
- `required_level integer DEFAULT 1` — inherited from managed team on import

Add unique constraint:

```sql
UNIQUE (date, home_team, away_team, created_by)
```

### RLS for `managed_teams`

Same pattern as `matches`: authenticated users can CRUD their own rows (`auth.uid() = created_by`).

---

## Column Mapping (KNHB CSV)

| CSV Column      | Maps to          | Notes                                          |
| --------------- | ---------------- | ---------------------------------------------- |
| `Datum`         | `date`           | Parse DD-MM-YYYY → YYYY-MM-DD                  |
| `Begintijd`     | `start_time`     | HH:MM + date → timestamptz. Can be empty.      |
| `Thuis team`    | `home_team`      | Used for team filtering                        |
| `Tegenstander`  | `away_team`      | Opponent short name                            |
| `Locatie`       | `venue`          | Optional                                       |
| `Veld`          | `field`          | Optional (e.g., "V1", "KG1")                   |
| (none)          | `competition`    | Left empty on import                           |
| (none)          | `required_level` | Inherited from managed team's `required_level` |
| Everything else | ignored          |                                                |

---

## Parsing Pipeline

All three input methods produce the same `RawRow[]`, then go through a shared pipeline:

1. **CSV file** → Papa Parse with `delimiter: ";"`, `header: true`, `skipEmptyLines: true`
2. **Excel file** → SheetJS → first sheet → JSON rows with headers
3. **Paste** → detect delimiter (tab or semicolon) → Papa Parse

Shared pipeline:

1. **Map columns** — KNHB header names → internal field names
2. **Filter by managed teams** — keep only rows where `Thuis team` is in the managed teams list
3. **Transform** — parse DD-MM-YYYY dates, combine date+time into timestamptz, assign required level from team
4. **Validate** — require date + home_team + away_team (start_time optional)
5. **Return `ParsedMatch[]`** for preview before saving

---

## Routes & UI

### `/protected/settings` — Managed Teams Configuration

- Table with columns: team name, required level (1/2/3 dropdown)
- Add team: text input + level selector
- Inline level editing
- Delete with confirmation

### `/protected/matches` — Match List + Upload

**Upload area (top of page):**

- Drag-and-drop zone accepting .csv / .xlsx
- "Paste" button opens textarea for spreadsheet paste
- After parsing: show count ("12 matches to import") → confirm button → upsert
- Server action returns counts (inserted/updated) after the fact

**Match table (below upload):**

- Grouped by date (collapsible sections)
- Columns: time, home team, away team, field, venue, level (badge), actions
- Default sort: chronological (date → time)
- Filtering: text search across teams, filter by level, filter by date range
- Add single match: button opens dialog form
- Edit match: dialog with all fields editable
- Delete: with confirmation

---

## Server Actions

### Matches (`lib/actions/matches.ts`)

- `upsertMatches(matches: ParsedMatch[])` — bulk upsert via `ON CONFLICT (date, home_team, away_team, created_by) DO UPDATE SET start_time, venue, field, required_level`
- `createMatch(data)` — single match insert
- `updateMatch(id, data)` — single match update
- `deleteMatch(id)` — single match delete
- `getMatches(filters?)` — fetch with optional date range, level, search

### Managed Teams (`lib/actions/managed-teams.ts`)

- `getManagedTeams()` — fetch all for current user
- `createManagedTeam(name, requiredLevel)` — add
- `updateManagedTeam(id, name, requiredLevel)` — edit
- `deleteManagedTeam(id)` — delete

---

## Client-Side Parsers (`lib/parsers/`)

- `csv.ts` — Papa Parse wrapper
- `excel.ts` — SheetJS wrapper
- `paste.ts` — delimiter detection + Papa Parse
- `knhb-mapper.ts` — column mapping, team filtering, date transformation, level assignment
- `types.ts` — `RawRow`, `ParsedMatch` types

---

## Dependencies

- `papaparse` + `@types/papaparse`
- `xlsx` (SheetJS)
- shadcn/ui components as needed: Table, Dialog, Badge, Select, Card, DropdownMenu

---

## File Structure

```
lib/
  actions/
    matches.ts
    managed-teams.ts
  parsers/
    csv.ts
    excel.ts
    paste.ts
    knhb-mapper.ts
    types.ts
  types/
    domain.ts              # Add ManagedTeam type

app/
  protected/
    matches/
      page.tsx
    settings/
      page.tsx

components/
  matches/
    match-table.tsx
    match-form.tsx
    upload-zone.tsx
    import-preview.tsx
  settings/
    managed-teams-list.tsx

supabase/
  migrations/
    20260213000003_stage2_schema.sql

__tests__/
  lib/
    parsers/
      csv.test.ts
      excel.test.ts
      paste.test.ts
      knhb-mapper.test.ts
    actions/
      matches.test.ts
      managed-teams.test.ts
  components/
    matches/
      match-table.test.tsx
      upload-zone.test.tsx
    settings/
      managed-teams-list.test.tsx
```

---

## Testing Strategy

**Unit tests (Vitest):**

- CSV parsing: semicolons, BOM, Dutch headers, DD-MM-YYYY dates
- Excel parsing: mock SheetJS output → same row format
- Paste: tab vs semicolon detection
- KNHB mapper: column mapping, team filtering, date/time transformation, missing time, level inheritance

**Server action tests (Vitest, mocked Supabase):**

- Upsert: new insert, existing update
- CRUD for matches and managed teams

**Component tests (Vitest + Testing Library):**

- Upload zone accepts files, shows preview
- Match table renders grouped by date
- Managed teams list with level editing

**E2E (Playwright, deferred):**

- Full upload → import flow

---

## Out of Scope

- No umpire management (Stage 3)
- No poll creation (Stage 4)
- No navigation/dashboard polish (Stage 7)
- No automated assignment suggestions
