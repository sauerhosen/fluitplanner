# Day Sheet Export Feature Implementation

_2026-03-01T18:39:12Z by Showboat 0.6.1_

<!-- showboat-id: 1bfd9ce1-0164-4281-af1c-8de121e4c811 -->

Implementing a simplified 'day sheet' export for the poll detail page. The day sheet shows matches for a single date with columns: Time | Match (Home - Away) | Field | Umpire 1 | Umpire 2. Available in all export formats (XLSX, HTML, Markdown, clipboard). Triggered from the assignments tab export dropdown, with one entry per date in the poll.

## Implementation Complete

### Files modified:

- **lib/export/prepare-export-data.ts** — Added `DaySheetRow`, `DaySheetExportData` types and `prepareDaySheetExport()` function
- **lib/export/generators/xlsx.ts** — Added `generateDaySheetXlsx()`
- **lib/export/generators/html.ts** — Added `generateDaySheetHtml()`
- **lib/export/generators/markdown.ts** — Added `generateDaySheetMarkdown()`
- **components/polls/export-dropdown.tsx** — Added day sheet sub-menus per date with all 4 export formats
- **messages/en.json** — Added `daySheet` and `daySheetMatch` keys
- **messages/nl.json** — Added `daySheet` and `daySheetMatch` keys
- ****tests**/lib/export/prepare-export-data.test.ts** — Added 8 tests for `prepareDaySheetExport`

```bash
npm run type-check 2>&1 && echo '---' && npx eslint components/polls/export-dropdown.tsx lib/export/ __tests__/lib/export/ 2>&1 && echo '---' && npm test 2>&1 | tail -5
```

```output

> fluitplanner@2.7.0 type-check
> tsc --noEmit

---
---
[2m Test Files [22m [1m[32m46 passed[39m[22m[90m (46)[39m
[2m      Tests [22m [1m[32m357 passed[39m[22m[90m (357)[39m
[2m   Start at [22m 19:46:44
[2m   Duration [22m 5.92s[2m (transform 1.81s, setup 2.31s, import 13.32s, tests 12.06s, environment 16.36s)[22m

```
