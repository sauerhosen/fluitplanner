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
