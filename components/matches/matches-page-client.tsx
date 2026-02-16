"use client";

import { useState, useCallback, useMemo } from "react";
import type { ManagedTeam } from "@/lib/types/domain";
import type { MatchFilters, MatchWithPoll } from "@/lib/actions/matches";
import { getMatches } from "@/lib/actions/matches";
import { UploadZone } from "./upload-zone";
import { MatchTable } from "./match-table";
import { MatchFormDialog } from "./match-form";
import { PollActionButtons } from "./poll-action-buttons";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { addMonths, format } from "date-fns";
import type { DateRange } from "react-day-picker";

export function MatchesPageClient({
  initialMatches,
  managedTeams,
  polls,
}: {
  initialMatches: MatchWithPoll[];
  managedTeams: ManagedTeam[];
  polls: { id: string; title: string | null; status: string }[];
}) {
  const [matches, setMatches] = useState(initialMatches);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [pollFilter, setPollFilter] = useState<string>("all");
  const [editingMatch, setEditingMatch] = useState<MatchWithPoll | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
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
    const data = await getMatches(
      buildFilters(search, levelFilter, dateRange, pollFilter),
    );
    setMatches(data);
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
    <div className="flex flex-col gap-6">
      <UploadZone
        managedTeams={managedTeams}
        onImportComplete={refreshMatches}
      />

      {/* Filters + Add button */}
      <div className="flex items-center gap-4">
        <Input
          placeholder={t("searchPlaceholder")}
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="max-w-xs"
        />
        <Select value={levelFilter} onValueChange={handleLevelChange}>
          <SelectTrigger className="w-48">
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
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("filterByPoll")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allPolls")}</SelectItem>
            <SelectItem value="none">{t("noPoll")}</SelectItem>
            {polls.map((poll) => (
              <SelectItem key={poll.id} value={poll.id}>
                {poll.title ?? poll.id}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DateRangePicker value={dateRange} onChange={handleDateRangeChange} />
        <div className="ml-auto">
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addMatch")}
          </Button>
        </div>
      </div>

      <MatchTable
        matches={matches}
        onEdit={(match) => setEditingMatch(match)}
        onDeleted={refreshMatches}
        toolbarActions={(selectedIds, clearSelection) => (
          <PollActionButtons
            selectedIds={selectedIds}
            matches={matches}
            polls={polls}
            onComplete={refreshMatches}
            clearSelection={clearSelection}
          />
        )}
      />

      {/* Add dialog */}
      <MatchFormDialog
        match={null}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSaved={refreshMatches}
      />

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
