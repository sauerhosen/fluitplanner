import * as XLSX from "xlsx";
import type { RawRow } from "./types";

export function parseExcel(data: ArrayBuffer): RawRow[] {
  const workbook = XLSX.read(data);
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json<RawRow>(sheet);
}
