"use client";

import { useState, useCallback, useMemo } from "react";
import type { ManagedTeam, HockeySyncState } from "@/lib/types/domain";
import type { MatchFilters, MatchWithPoll } from "@/lib/actions/matches";
import { getMatches } from "@/lib/actions/matches";
import { getPollOptions } from "@/lib/actions/polls";
import { UploadZone } from "./upload-zone";
import { MatchTable } from "./match-table";
import { SyncNowButton } from "./sync-now-button";
import { MatchFormDialog } from "./match-form";
import { PollActionButtons } from "./poll-action-buttons";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { StickyToolbar } from "@/components/shared/sticky-toolbar";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { addMonths, format } from "date-fns";
import type { DateRange } from "react-day-picker";

export function MatchesPageClient({
  initialMatches,
  managedTeams,
  polls,
  syncState = null,
  showSync = false,
  isPlanner = false,
}: {
  initialMatches: MatchWithPoll[];
  managedTeams: ManagedTeam[];
  polls: { id: string; title: string | null; status: string }[];
  syncState?: HockeySyncState | null;
  showSync?: boolean;
  isPlanner?: boolean;
}) {
  const [matches, setMatches] = useState(initialMatches);
  const [currentPolls, setCurrentPolls] = useState(polls);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [pollFilter, setPollFilter] = useState<string>("all");
  const [editingMatch, setEditingMatch] = useState<MatchWithPoll | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const t = useTranslations("matches");

  const defaultDateRange = useMemo<DateRange>(() => {
    const now = new Date();
    return { from: now, to: addMonths(now, 2) };
  }, []);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(
    defaultDateRange,
  );

  function buildFilters(
    s: string,
    level: string,
    range: DateRange | undefined,
    poll: string,
  ): MatchFilters {
    const filters: MatchFilters = {};
    if (range?.from) {
      filters.dateFrom = format(range.from, "yyyy-MM-dd");
      if (range.to) filters.dateTo = format(range.to, "yyyy-MM-dd");
    }
    if (s) filters.search = s;
    if (level !== "all") filters.requiredLevel = Number(level) as 1 | 2 | 3;
    if (poll !== "all") filters.pollId = poll;
    return filters;
  }

  const refreshMatches = useCallback(async () => {
    const [matchData, pollData] = await Promise.all([
      getMatches(buildFilters(search, levelFilter, dateRange, pollFilter)),
      getPollOptions(),
    ]);
    setMatches(matchData);
    setCurrentPolls(pollData);
  }, [search, levelFilter, dateRange, pollFilter]);

  async function handleSearchChange(value: string) {
    setSearch(value);
    const data = await getMatches(
      buildFilters(value, levelFilter, dateRange, pollFilter),
    );
    setMatches(data);
  }

  async function handleLevelChange(value: string) {
    setLevelFilter(value);
    const data = await getMatches(
      buildFilters(search, value, dateRange, pollFilter),
    );
    setMatches(data);
  }

  async function handleDateRangeChange(range: DateRange | undefined) {
    setDateRange(range);
    const data = await getMatches(
      buildFilters(search, levelFilter, range, pollFilter),
    );
    setMatches(data);
  }

  async function handlePollChange(value: string) {
    setPollFilter(value);
    const data = await getMatches(
      buildFilters(search, levelFilter, dateRange, value),
    );
    setMatches(data);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={
          <h1 className="truncate text-xl font-semibold">{t("pageTitle")}</h1>
        }
        actions={
          <>
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t("addMatch")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  aria-label={t("moreActions")}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuCheckboxItem
                  checked={importOpen}
                  onCheckedChange={setImportOpen}
                >
                  {t("importMatches")}
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <StickyToolbar
        compact={
          <h2 className="truncate text-sm font-medium">{t("pageTitle")}</h2>
        }
      >
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="h-8 max-w-xs"
        />
        <Select value={levelFilter} onValueChange={handleLevelChange}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue placeholder={t("filterByLevel")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allLevels")}</SelectItem>
            <SelectItem value="1">{t("levelAny")}</SelectItem>
            <SelectItem value="2">{t("levelExperienced")}</SelectItem>
            <SelectItem value="3">{t("levelTop")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={pollFilter} onValueChange={handlePollChange}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue placeholder={t("filterByPoll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allPolls")}</SelectItem>
            <SelectItem value="none">{t("noPoll")}</SelectItem>
            {currentPolls.map((poll) => (
              <SelectItem key={poll.id} value={poll.id}>
                {poll.title ?? poll.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
        {showSync && (
          <div className="ml-auto">
            <SyncNowButton initialState={syncState} onSynced={refreshMatches} />
          </div>
        )}
      </StickyToolbar>

      {/* Import panel: opened from the overflow menu, shown under the toolbar
          so it never occupies a row of chrome while closed. */}
      <Collapsible open={importOpen} onOpenChange={setImportOpen}>
        <CollapsibleContent>
          <UploadZone
            managedTeams={managedTeams}
            onImportComplete={refreshMatches}
          />
        </CollapsibleContent>
      </Collapsible>

      <MatchTable
        matches={matches}
        onEdit={(match) => setEditingMatch(match)}
        onDeleted={refreshMatches}
        canDismissReview={isPlanner}
        toolbarActions={(selectedIds, clearSelection) => (
          <PollActionButtons
            selectedIds={selectedIds}
            matches={matches}
            polls={currentPolls}
            onComplete={refreshMatches}
            clearSelection={clearSelection}
          />
        )}
      />

      {/* Add dialog — mounted only while open, so each opening starts blank
          rather than holding on to the last match's details and note. */}
      {showAddDialog && (
        <MatchFormDialog
          match={null}
          open={true}
          onOpenChange={setShowAddDialog}
          onSaved={refreshMatches}
        />
      )}

      {/* Edit dialog */}
      {editingMatch && (
        <MatchFormDialog
          match={editingMatch}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingMatch(null);
          }}
          onSaved={refreshMatches}
        />
      )}
    </div>
  );
}
