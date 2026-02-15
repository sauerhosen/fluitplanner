"use client";

import { useCallback, useState } from "react";
import { parseCSV } from "@/lib/parsers/csv";
import { parsePaste } from "@/lib/parsers/paste";
import { mapKNHBRows, extractHomeTeams } from "@/lib/parsers/knhb-mapper";
import { upsertMatches } from "@/lib/actions/matches";
import type { ManagedTeam } from "@/lib/types/domain";
import type { ParseResult, RawRow } from "@/lib/parsers/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload, ClipboardPaste } from "lucide-react";
import { useTranslations } from "next-intl";
import { TeamSelector } from "./team-selector";
import { AddToManagedDialog } from "./add-to-managed-dialog";

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
  const [importMode, setImportMode] = useState<"quick" | "advanced">("quick");
  const [rawRows, setRawRows] = useState<RawRow[] | null>(null);
  const [allHomeTeams, setAllHomeTeams] = useState<string[]>([]);
  const [nonManagedSelected, setNonManagedSelected] = useState<string[]>([]);
  const [showAddToManaged, setShowAddToManaged] = useState(false);
  const t = useTranslations("matches");
  const tCommon = useTranslations("common");

  const managedTeamNames = managedTeams.map((mt) => mt.name);

  const processRows = useCallback(
    (rows: RawRow[]) => {
      if (importMode === "advanced") {
        const teams = extractHomeTeams(rows);
        setRawRows(rows);
        setAllHomeTeams(teams);
        setParseResult(null);
        setImportResult(null);
      } else {
        const result = mapKNHBRows(rows, { managedTeams });
        setParseResult(result);
        setImportResult(null);
      }
    },
    [managedTeams, importMode],
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

  function handleTeamSelectorConfirm(selectedTeams: string[]) {
    if (!rawRows) return;
    const managedSet = new Set(managedTeamNames);
    const nonManaged = selectedTeams.filter((t) => !managedSet.has(t));
    setNonManagedSelected(nonManaged);

    const result = mapKNHBRows(rawRows, { managedTeams, selectedTeams });
    setParseResult(result);
    setRawRows(null);
    setAllHomeTeams([]);
  }

  function handleTeamSelectorCancel() {
    setRawRows(null);
    setAllHomeTeams([]);
  }

  async function handleImport() {
    if (!parseResult || parseResult.matches.length === 0) return;
    setImporting(true);
    try {
      const result = await upsertMatches(parseResult.matches);
      setImportResult(result);
      setParseResult(null);
      onImportComplete();

      if (importMode === "advanced" && nonManagedSelected.length > 0) {
        setShowAddToManaged(true);
      }
    } finally {
      setImporting(false);
    }
  }

  function handleReset() {
    setParseResult(null);
    setImportResult(null);
    setRawRows(null);
    setAllHomeTeams([]);
    setNonManagedSelected([]);
    setShowAddToManaged(false);
  }

  function handleAddToManagedDone() {
    setShowAddToManaged(false);
    setNonManagedSelected([]);
    onImportComplete();
  }

  return (
    <div className="space-y-4">
      {/* Import mode toggle */}
      <RadioGroup
        value={importMode}
        onValueChange={(v) => setImportMode(v as "quick" | "advanced")}
        className="flex gap-4"
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <RadioGroupItem value="quick" aria-label={t("importModeQuick")} />
          <div>
            <p className="text-sm font-medium">{t("importModeQuick")}</p>
            <p className="text-xs text-muted-foreground">
              {t("importModeQuickDesc")}
            </p>
          </div>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <RadioGroupItem
            value="advanced"
            aria-label={t("importModeAdvanced")}
          />
          <div>
            <p className="text-sm font-medium">{t("importModeAdvanced")}</p>
            <p className="text-xs text-muted-foreground">
              {t("importModeAdvancedDesc")}
            </p>
          </div>
        </label>
      </RadioGroup>

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

      {/* Team selector (advanced mode) */}
      {rawRows && allHomeTeams.length > 0 && (
        <TeamSelector
          teams={allHomeTeams}
          managedTeamNames={managedTeamNames}
          onConfirm={handleTeamSelectorConfirm}
          onCancel={handleTeamSelectorCancel}
        />
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

      {/* Add to managed dialog (advanced mode, post-import) */}
      <AddToManagedDialog
        key={nonManagedSelected.join(",")}
        open={showAddToManaged}
        teams={nonManagedSelected}
        onDone={handleAddToManagedDone}
      />
    </div>
  );
}
