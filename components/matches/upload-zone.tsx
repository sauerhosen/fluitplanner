"use client";

import { useCallback, useState } from "react";
import { parseCSV } from "@/lib/parsers/csv";
import { parsePaste } from "@/lib/parsers/paste";
import { mapKNHBRows } from "@/lib/parsers/knhb-mapper";
import { upsertMatches } from "@/lib/actions/matches";
import type { ManagedTeam } from "@/lib/types/domain";
import type { ParseResult } from "@/lib/parsers/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Upload, ClipboardPaste } from "lucide-react";
import { useTranslations } from "next-intl";

export function UploadZone({
  managedTeams,
  onImportComplete,
}: {
  managedTeams: ManagedTeam[];
  onImportComplete: () => void;
}) {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    inserted: number;
    updated: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const t = useTranslations("matches");
  const tCommon = useTranslations("common");

  const processRows = useCallback(
    (rows: Record<string, string>[]) => {
      const result = mapKNHBRows(rows, { managedTeams });
      setParseResult(result);
      setImportResult(null);
    },
    [managedTeams],
  );

  async function handleFile(file: File) {
    if (file.name.endsWith(".xlsx")) {
      const { parseExcel } = await import("@/lib/parsers/excel");
      const buffer = await file.arrayBuffer();
      const rows = await parseExcel(buffer);
      processRows(rows);
    } else if (file.name.endsWith(".csv")) {
      const text = await file.text();
      const rows = parseCSV(text);
      processRows(rows);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function handlePaste() {
    if (!pasteText.trim()) return;
    const rows = parsePaste(pasteText);
    processRows(rows);
    setShowPaste(false);
    setPasteText("");
  }

  async function handleImport() {
    if (!parseResult || parseResult.matches.length === 0) return;
    setImporting(true);
    try {
      const result = await upsertMatches(parseResult.matches);
      setImportResult(result);
      setParseResult(null);
      onImportComplete();
    } finally {
      setImporting(false);
    }
  }

  function handleReset() {
    setParseResult(null);
    setImportResult(null);
  }

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <Card
        className={`border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="flex flex-col items-center gap-3">
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div>
            <p className="font-medium">{t("dropFileHere")}</p>
            <p className="text-sm text-muted-foreground">{t("orUseButtons")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <label className="cursor-pointer">
                <Upload className="mr-2 h-4 w-4" />
                {t("chooseFile")}
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  className="hidden"
                  onChange={handleFileInput}
                />
              </label>
            </Button>
            <Button variant="outline" onClick={() => setShowPaste(!showPaste)}>
              <ClipboardPaste className="mr-2 h-4 w-4" />
              {t("paste")}
            </Button>
          </div>
        </div>
      </Card>

      {/* Paste textarea */}
      {showPaste && (
        <div className="space-y-2">
          <textarea
            className="w-full h-32 rounded-md border bg-background p-3 text-sm font-mono"
            placeholder={t("pastePlaceholder")}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="flex gap-2">
            <Button onClick={handlePaste} disabled={!pasteText.trim()}>
              {t("parse")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowPaste(false);
                setPasteText("");
              }}
            >
              {tCommon("cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Parse result preview */}
      {parseResult && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {t("readyToImport", { count: parseResult.matches.length })}
              </p>
              {parseResult.skippedCount > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t("skippedCount", { count: parseResult.skippedCount })}
                </p>
              )}
              {parseResult.errors.length > 0 && (
                <p className="text-sm text-destructive">
                  {t("errorCount", { count: parseResult.errors.length })}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleImport}
                disabled={importing || parseResult.matches.length === 0}
              >
                {importing ? t("importing") : t("import")}
              </Button>
              <Button variant="ghost" onClick={handleReset}>
                {tCommon("cancel")}
              </Button>
            </div>
          </div>
          {parseResult.errors.length > 0 && (
            <ul className="text-sm text-destructive space-y-1">
              {parseResult.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {/* Import result */}
      {importResult && (
        <Card className="p-4">
          <p className="text-sm">
            {t("importComplete", {
              inserted: importResult.inserted,
              updated: importResult.updated,
            })}
          </p>
        </Card>
      )}
    </div>
  );
}
