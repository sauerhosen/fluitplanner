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
