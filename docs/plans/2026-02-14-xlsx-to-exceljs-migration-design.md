# Replace xlsx with ExcelJS

## Problem

CVE-2024-22363: ReDoS vulnerability in `xlsx` (SheetJS) < 0.20.2. The npm package is abandoned at v0.18.5 with no patched version available on npm.

## Decision

Replace `xlsx` with `exceljs` — actively maintained, proper npm distribution, covers the same use case.

## Changes

### 1. `lib/parsers/excel.ts`

Rewrite `parseExcel(data: ArrayBuffer)` to return `Promise<RawRow[]>` using ExcelJS:

- Load workbook from Buffer via `workbook.xlsx.load()`
- Read first worksheet
- Extract header row (`worksheet.getRow(1)`)
- Map remaining rows to `Record<string, string>` objects
- Return empty array for empty workbooks/sheets

### 2. `components/matches/upload-zone.tsx`

Add `await` to `parseExcel(buffer)` call (already inside async `handleFile`).

### 3. `__tests__/lib/parsers/excel.test.ts`

Replace mock-based tests with real ExcelJS workbooks built in-memory. Tests become async. Covers:

- Extracts rows from first sheet
- Returns empty array for workbook with no data rows
- Handles empty cells gracefully

### Package changes

```bash
npm uninstall xlsx && npm install exceljs
```

## TDD approach

Red: update tests first to use ExcelJS and async, expect them to fail.
Green: implement the new `parseExcel` with ExcelJS.
Refactor: clean up, verify call site works.
