import ExcelJS from "exceljs";
import type { RawRow } from "./types";

export async function parseExcel(data: ArrayBuffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(data));

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
