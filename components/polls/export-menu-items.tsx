"use client";

import { useCallback, useMemo } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Code,
  Copy,
  CalendarDays,
  Image as ImageIcon,
} from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { generateDaySheetPng } from "@/lib/export/generators/image";
import {
  downloadBlob,
  copyToClipboard,
  copyImageToClipboard,
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
};

/**
 * Everything that leaves the poll as a file, as items for an enclosing
 * dropdown: a day sheet per match day, then the full assignment and response
 * tables. Both tables are always offered and named for what they hold, rather
 * than one Export that silently follows whichever view is open.
 */
export function ExportMenuItems({
  pollTitle,
  slots,
  matches,
  responses,
  assignments,
  umpires,
}: Props) {
  const t = useTranslations("polls");
  const format = useFormatter();
  const locale = useLocale();

  const formatDate = useCallback(
    (iso: string): string =>
      format.dateTime(new Date(iso), {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    [format],
  );

  function formatTime(iso: string): string {
    return format.dateTime(new Date(iso), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const uniqueDates = useMemo(() => {
    const dates = [...new Set(matches.map((m) => m.date))].sort();
    return dates.map((d) => ({ iso: d, label: formatDate(d) }));
  }, [matches, formatDate]);

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

  function markdownFor(target: ExportTarget) {
    return target === "responses"
      ? generateResponseMarkdown(
          prepareResponseExport(
            pollTitle,
            slots,
            responses,
            formatDate,
            formatTime,
          ),
          responseLabels,
        )
      : generateAssignmentMarkdown(assignmentData(), assignmentColumnLabels);
  }

  function assignmentData() {
    return prepareAssignmentExport(
      pollTitle,
      matches,
      assignments,
      umpires,
      formatDate,
      formatTime,
    );
  }

  function responseData() {
    return prepareResponseExport(
      pollTitle,
      slots,
      responses,
      formatDate,
      formatTime,
    );
  }

  async function handleTable(
    target: ExportTarget,
    exportFormat: "xlsx" | "html" | "markdown" | "copy",
  ) {
    const file = (ext: string) => `${fileBase}-${target}.${ext}`;
    try {
      if (exportFormat === "xlsx") {
        const { generateResponseXlsx, generateAssignmentXlsx } =
          await import("@/lib/export/generators/xlsx");
        const blob =
          target === "responses"
            ? await generateResponseXlsx(responseData(), responseLabels)
            : await generateAssignmentXlsx(
                assignmentData(),
                assignmentColumnLabels,
              );
        downloadBlob(blob, file("xlsx"));
      } else if (exportFormat === "html") {
        const html =
          target === "responses"
            ? generateResponseHtml(responseData(), responseLabels, locale)
            : generateAssignmentHtml(
                assignmentData(),
                assignmentColumnLabels,
                locale,
              );
        downloadBlob(
          new Blob([html], { type: "text/html;charset=utf-8" }),
          file("html"),
        );
      } else if (exportFormat === "markdown") {
        downloadBlob(
          new Blob([markdownFor(target)], {
            type: "text/markdown;charset=utf-8",
          }),
          file("md"),
        );
      } else {
        const ok = await copyToClipboard(markdownFor(target));
        if (ok) toast.success(t("copied"));
        else toast.error(t("copyFailed"));
      }
    } catch {
      toast.error(t("exportError"));
    }
  }

  async function handleDaySheet(
    exportFormat: "xlsx" | "html" | "markdown" | "copy" | "png" | "copyImage",
    filterDate: string,
  ) {
    const daySheetFile = (ext: string) =>
      `${fileBase}-daysheet-${filterDate}.${ext}`;
    try {
      const data = prepareDaySheetExport(
        pollTitle,
        matches,
        assignments,
        umpires,
        formatDate,
        formatTime,
        filterDate,
      );
      if (exportFormat === "copyImage") {
        // No await before the clipboard write: it must stay in the click's gesture.
        const ok = await copyImageToClipboard(() =>
          generateDaySheetPng(data, daySheetColumnLabels),
        );
        if (ok) toast.success(t("copiedImage"));
        else toast.error(t("copyFailed"));
      } else if (exportFormat === "png") {
        const blob = await generateDaySheetPng(data, daySheetColumnLabels);
        downloadBlob(blob, daySheetFile("png"));
      } else if (exportFormat === "xlsx") {
        const { generateDaySheetXlsx } =
          await import("@/lib/export/generators/xlsx");
        const blob = await generateDaySheetXlsx(data, daySheetColumnLabels);
        downloadBlob(blob, daySheetFile("xlsx"));
      } else if (exportFormat === "html") {
        const html = generateDaySheetHtml(data, daySheetColumnLabels, locale);
        downloadBlob(
          new Blob([html], { type: "text/html;charset=utf-8" }),
          daySheetFile("html"),
        );
      } else {
        const md = generateDaySheetMarkdown(data, daySheetColumnLabels);
        if (exportFormat === "copy") {
          const ok = await copyToClipboard(md);
          if (ok) toast.success(t("copied"));
          else toast.error(t("copyFailed"));
        } else {
          downloadBlob(
            new Blob([md], { type: "text/markdown;charset=utf-8" }),
            daySheetFile("md"),
          );
        }
      }
    } catch {
      toast.error(t("exportError"));
    }
  }

  function tableItems(target: ExportTarget) {
    return (
      <>
        <DropdownMenuItem onClick={() => handleTable(target, "xlsx")}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          {t("exportXlsx")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleTable(target, "html")}>
          <Code className="mr-2 h-4 w-4" />
          {t("exportHtml")}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleTable(target, "markdown")}>
          <FileText className="mr-2 h-4 w-4" />
          {t("exportMarkdown")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handleTable(target, "copy")}>
          <Copy className="mr-2 h-4 w-4" />
          {t("copyMarkdown")}
        </DropdownMenuItem>
      </>
    );
  }

  return (
    <>
      <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
        {t("shareAssignmentsGroup")}
      </DropdownMenuLabel>
      {uniqueDates.map((date) => (
        <DropdownMenuSub key={date.iso}>
          <DropdownMenuSubTrigger data-testid={`day-sheet-${date.iso}`}>
            <CalendarDays className="mr-2 h-4 w-4" />
            {t("daySheetFor", { date: date.label })}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => handleDaySheet("xlsx", date.iso)}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              {t("exportXlsx")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDaySheet("html", date.iso)}>
              <Code className="mr-2 h-4 w-4" />
              {t("exportHtml")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleDaySheet("markdown", date.iso)}
            >
              <FileText className="mr-2 h-4 w-4" />
              {t("exportMarkdown")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDaySheet("png", date.iso)}>
              <ImageIcon className="mr-2 h-4 w-4" />
              {t("exportPng")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => handleDaySheet("copyImage", date.iso)}
            >
              <ImageIcon className="mr-2 h-4 w-4" />
              {t("copyImage")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDaySheet("copy", date.iso)}>
              <Copy className="mr-2 h-4 w-4" />
              {t("copyMarkdown")}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ))}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-testid="export-assignments">
          <Download className="mr-2 h-4 w-4" />
          {t("exportAllAssignments")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {tableItems("assignments")}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger data-testid="export-responses">
          <Download className="mr-2 h-4 w-4" />
          {t("exportAllResponses")}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {tableItems("responses")}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}
