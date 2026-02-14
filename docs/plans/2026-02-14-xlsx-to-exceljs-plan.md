# Replace xlsx with ExcelJS — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix CVE-2024-22363 by replacing the abandoned `xlsx` package with `exceljs`.

**Architecture:** Swap the single `parseExcel` function from sync xlsx API to async ExcelJS API. Update the one call site to await. Rewrite tests to use real in-memory workbooks instead of mocks.

**Tech Stack:** ExcelJS, Vitest, Next.js App Router

---

### Task 1: Swap npm packages

**Step 1: Uninstall xlsx and install exceljs**

Run: `npm uninstall xlsx && npm install exceljs`

**Step 2: Verify install succeeded**

Run: `npm ls exceljs`
Expected: `exceljs@<version>` in tree, no `xlsx` present.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "fix: replace xlsx with exceljs (CVE-2024-22363)"
```

---

### Task 2: Write failing tests (RED)

**Files:**

- Rewrite: `__tests__/lib/parsers/excel.test.ts`

**Step 1: Rewrite the test file**

Replace the entire contents of `__tests__/lib/parsers/excel.test.ts` with:

```typescript
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseExcel } from "@/lib/parsers/excel";

/** Build a real .xlsx buffer in memory using ExcelJS */
async function buildExcelBuffer(
  rows: Record<string, string>[],
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");

  if (rows.length === 0) {
    const nodeBuffer = (await workbook.xlsx.writeBuffer()) as Buffer;
    return nodeBuffer.buffer.slice(
      nodeBuffer.byteOffset,
      nodeBuffer.byteOffset + nodeBuffer.byteLength,
    );
  }

  const headers = Object.keys(rows[0]);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(headers.map((h) => row[h] ?? ""));
  }

  const nodeBuffer = (await workbook.xlsx.writeBuffer()) as Buffer;
  return nodeBuffer.buffer.slice(
    nodeBuffer.byteOffset,
    nodeBuffer.byteOffset + nodeBuffer.byteLength,
  );
}

describe("parseExcel", () => {
  it("extracts rows from first sheet", async () => {
    const buf = await buildExcelBuffer([
      {
        Datum: "14-02-2026",
        Begintijd: "09:30",
        "Thuis team": "Heren 01",
        Tegenstander: "Opp",
      },
    ]);
    const rows = await parseExcel(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Datum"]).toBe("14-02-2026");
    expect(rows[0]["Thuis team"]).toBe("Heren 01");
  });

  it("returns empty array for workbook with no data rows", async () => {
    const buf = await buildExcelBuffer([]);
    const rows = await parseExcel(buf);
    expect(rows).toEqual([]);
  });

  it("handles empty cells as empty strings", async () => {
    const buf = await buildExcelBuffer([
      { Name: "Alice", Email: "" },
      { Name: "", Email: "bob@example.com" },
    ]);
    const rows = await parseExcel(buf);
    expect(rows).toHaveLength(2);
    expect(rows[0]["Email"]).toBe("");
    expect(rows[1]["Name"]).toBe("");
  });
});
```

**Step 2: Run the tests to verify they fail**

Run: `npx vitest run __tests__/lib/parsers/excel.test.ts`
Expected: FAIL — `parseExcel` still uses old sync xlsx API and doesn't return a Promise.

**Step 3: Commit the failing tests**

```bash
git add __tests__/lib/parsers/excel.test.ts
git commit -m "test: rewrite excel parser tests for exceljs (red)"
```

---

### Task 3: Implement parseExcel with ExcelJS (GREEN)

**Files:**

- Rewrite: `lib/parsers/excel.ts`

**Step 1: Rewrite the implementation**

Replace the entire contents of `lib/parsers/excel.ts` with:

```typescript
import ExcelJS from "exceljs";
import type { RawRow } from "./types";

export async function parseExcel(data: ArrayBuffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) return [];

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "");
  });

  if (headers.length === 0) return [];

  const rows: RawRow[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const obj: RawRow = {};
    for (let col = 1; col < headers.length + 1; col++) {
      if (headers[col]) {
        obj[headers[col]] = String(row.getCell(col).value ?? "");
      }
    }
    rows.push(obj);
  }

  return rows;
}
```

**Step 2: Run tests to verify they pass**

Run: `npx vitest run __tests__/lib/parsers/excel.test.ts`
Expected: All 3 tests PASS.

**Step 3: Commit**

```bash
git add lib/parsers/excel.ts
git commit -m "fix: implement parseExcel with exceljs"
```

---

### Task 4: Update call site

**Files:**

- Modify: `components/matches/upload-zone.tsx` (line 44)

**Step 1: Add await to parseExcel call**

In `components/matches/upload-zone.tsx`, change line 44 from:

```typescript
const rows = parseExcel(buffer);
```

to:

```typescript
const rows = await parseExcel(buffer);
```

**Step 2: Run type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add components/matches/upload-zone.tsx
git commit -m "fix: await async parseExcel in upload zone"
```

---

### Task 5: Full verification

**Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass.

**Step 2: Run lint**

Run: `npm run lint`
Expected: No errors.

**Step 3: Run build**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Verify xlsx is fully removed**

Run: `npm ls xlsx 2>&1`
Expected: `xlsx` not in dependency tree (error or empty).

**Step 5: Commit any remaining changes (if lint auto-fixed anything)**

```bash
git add -A && git commit -m "chore: lint fixes" || echo "nothing to commit"
```
