"use client";

import { useMemo, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Code,
  Copy,
  Check,
  CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslations, useFormatter, useLocale } from "next-intl";
import { toast } from "sonner";
import type {
  Match,
  PollSlot,
  AvailabilityResponse,
  Assignment,
  Umpire,
} from "@/lib/types/domain";
import {
  prepareResponseExport,
  prepareAssignmentExport,
  prepareDaySheetExport,
} from "@/lib/export/prepare-export-data";
import {
  generateResponseHtml,
  generateAssignmentHtml,
  generateDaySheetHtml,
} from "@/lib/export/generators/html";
import {
  generateResponseMarkdown,
  generateAssignmentMarkdown,
  generateDaySheetMarkdown,
} from "@/lib/export/generators/markdown";
import {
  downloadBlob,
  copyToClipboard,
  sanitizeFilename,
} from "@/lib/export/download";

type ExportTarget = "responses" | "assignments";

type Props = {
  pollTitle: string;
  slots: PollSlot[];
  matches: Match[];
  responses: AvailabilityResponse[];
  assignments: Assignment[];
  umpires: Umpire[];
  activeTab: string;
};

export function ExportDropdown({
  pollTitle,
  slots,
  matches,
  responses,
  assignments,
  umpires,
  activeTab,
}: Props) {
  const t = useTranslations("polls");
  const format = useFormatter();
  const locale = useLocale();
  const [copiedMd, setCopiedMd] = useState(false);

  function formatDate(iso: string): string {
    return format.dateTime(new Date(iso), {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  function formatTime(iso: string): string {
    return format.dateTime(new Date(iso), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  // Extract unique dates from matches for day sheet sub-menu
  // Must be before early return to satisfy React hooks rules
  const uniqueDates = useMemo(() => {
    const dates = [...new Set(matches.map((m) => m.date))].sort();
    return dates.map((d) => ({ iso: d, label: formatDate(d) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches]);

  const target: ExportTarget | null =
    activeTab === "responses"
      ? "responses"
      : activeTab === "assignments"
        ? "assignments"
        : null;

  if (!target) return null;

  const responseLabels = {
    yes: t("availableLabel"),
    ifNeedBe: t("ifNeedBeLabel"),
    no: t("notAvailableLabel"),
    noResponse: t("noResponseLabel"),
    noData: t("noDataToExport"),
  };

  const assignmentColumnLabels = {
    date: t("exportDate"),
    time: t("exportTime"),
    homeTeam: t("exportHomeTeam"),
    awayTeam: t("exportAwayTeam"),
    venue: t("exportVenue"),
    field: t("exportField"),
    competition: t("exportCompetition"),
    umpire1: t("exportUmpire1"),
    umpire2: t("exportUmpire2"),
    count: t("exportCount"),
    noData: t("noDataToExport"),
  };

  const daySheetColumnLabels = {
    time: t("exportTime"),
    match: t("daySheetMatch"),
    field: t("exportField"),
    umpire1: t("exportUmpire1"),
    umpire2: t("exportUmpire2"),
    noData: t("noDataToExport"),
  };

  const fileBase = sanitizeFilename(pollTitle);
  const suffix = target === "responses" ? "responses" : "assignments";

  function getResponseData() {
    return prepareResponseExport(
      pollTitle,
      slots,
      responses,
      formatDate,
      formatTime,
    );
  }

  function getAssignmentData() {
    return prepareAssignmentExport(
      pollTitle,
      matches,
      assignments,
      umpires,
      formatDate,
      formatTime,
    );
  }

  function getDaySheetData(filterDate: string) {
    return prepareDaySheetExport(
      pollTitle,
      matches,
      assignments,
      umpires,
      formatDate,
      formatTime,
      filterDate,
    );
  }

  async function handleExportXlsx() {
    try {
      const { generateResponseXlsx, generateAssignmentXlsx } =
        await import("@/lib/export/generators/xlsx");
      const blob =
        target === "responses"
          ? await generateResponseXlsx(getResponseData(), responseLabels)
          : await generateAssignmentXlsx(
              getAssignmentData(),
              assignmentColumnLabels,
            );
      downloadBlob(blob, `${fileBase}-${suffix}.xlsx`);
    } catch {
      toast.error(t("exportError"));
    }
  }

  function handleExportHtml() {
    try {
      const html =
        target === "responses"
          ? generateResponseHtml(getResponseData(), responseLabels, locale)
          : generateAssignmentHtml(
              getAssignmentData(),
              assignmentColumnLabels,
              locale,
            );
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      downloadBlob(blob, `${fileBase}-${suffix}.html`);
    } catch {
      toast.error(t("exportError"));
    }
  }

  function handleExportMarkdown() {
    try {
      const md =
        target === "responses"
          ? generateResponseMarkdown(getResponseData(), responseLabels)
          : generateAssignmentMarkdown(
              getAssignmentData(),
              assignmentColumnLabels,
            );
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      downloadBlob(blob, `${fileBase}-${suffix}.md`);
    } catch {
      toast.error(t("exportError"));
    }
  }

  async function handleCopyMarkdown() {
    try {
      const md =
        target === "responses"
          ? generateResponseMarkdown(getResponseData(), responseLabels)
          : generateAssignmentMarkdown(
              getAssignmentData(),
              assignmentColumnLabels,
            );
      const ok = await copyToClipboard(md);
      if (ok) {
        setCopiedMd(true);
        toast.success(t("copied"));
        setTimeout(() => setCopiedMd(false), 2000);
      } else {
        toast.error(t("copyFailed"));
      }
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  async function handleDaySheetXlsx(filterDate: string) {
    try {
      const { generateDaySheetXlsx } =
        await import("@/lib/export/generators/xlsx");
      const data = getDaySheetData(filterDate);
      const blob = await generateDaySheetXlsx(data, daySheetColumnLabels);
      downloadBlob(blob, `${fileBase}-daysheet-${filterDate}.xlsx`);
    } catch {
      toast.error(t("exportError"));
    }
  }

  function handleDaySheetHtml(filterDate: string) {
    try {
      const data = getDaySheetData(filterDate);
      const html = generateDaySheetHtml(data, daySheetColumnLabels, locale);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      downloadBlob(blob, `${fileBase}-daysheet-${filterDate}.html`);
    } catch {
      toast.error(t("exportError"));
    }
  }

  function handleDaySheetMarkdown(filterDate: string) {
    try {
      const data = getDaySheetData(filterDate);
      const md = generateDaySheetMarkdown(data, daySheetColumnLabels);
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      downloadBlob(blob, `${fileBase}-daysheet-${filterDate}.md`);
    } catch {
      toast.error(t("exportError"));
    }
  }

  async function handleDaySheetCopyMarkdown(filterDate: string) {
    try {
      const data = getDaySheetData(filterDate);
      const md = generateDaySheetMarkdown(data, daySheetColumnLabels);
      const ok = await copyToClipboard(md);
      if (ok) {
        setCopiedMd(true);
        toast.success(t("copied"));
        setTimeout(() => setCopiedMd(false), 2000);
      } else {
        toast.error(t("copyFailed"));
      }
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          {t("export")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("exportAs")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={handleExportXlsx}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {t("exportXlsx")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportHtml}>
            <Code className="mr-2 h-4 w-4" />
            {t("exportHtml")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExportMarkdown}>
            <FileText className="mr-2 h-4 w-4" />
            {t("exportMarkdown")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleCopyMarkdown}>
          {copiedMd ? (
            <Check className="mr-2 h-4 w-4" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          {copiedMd ? t("copied") : t("copyMarkdown")}
        </DropdownMenuItem>
        {target === "assignments" && uniqueDates.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t("daySheet")}</DropdownMenuLabel>
            {uniqueDates.map((date) => (
              <DropdownMenuSub key={date.iso}>
                <DropdownMenuSubTrigger>
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {date.label}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem
                    onClick={() => handleDaySheetXlsx(date.iso)}
                  >
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    {t("exportXlsx")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDaySheetHtml(date.iso)}
                  >
                    <Code className="mr-2 h-4 w-4" />
                    {t("exportHtml")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDaySheetMarkdown(date.iso)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    {t("exportMarkdown")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => handleDaySheetCopyMarkdown(date.iso)}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    {t("copyMarkdown")}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
