"use client";

import { useState, useCallback } from "react";
import type { Match, ManagedTeam } from "@/lib/types/domain";
import type { MatchFilters } from "@/lib/actions/matches";
import { getMatches } from "@/lib/actions/matches";
import { UploadZone } from "./upload-zone";
import { MatchTable } from "./match-table";
import { MatchFormDialog } from "./match-form";
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

export function MatchesPageClient({
  initialMatches,
  managedTeams,
}: {
  initialMatches: Match[];
  managedTeams: ManagedTeam[];
}) {
  const [matches, setMatches] = useState(initialMatches);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const t = useTranslations("matches");

  const refreshMatches = useCallback(async () => {
    const filters: MatchFilters = {};
    if (search) filters.search = search;
    if (levelFilter !== "all")
      filters.requiredLevel = Number(levelFilter) as 1 | 2 | 3;
    const data = await getMatches(filters);
    setMatches(data);
  }, [search, levelFilter]);

  async function handleSearchChange(value: string) {
    setSearch(value);
    const filters: MatchFilters = {};
    if (value) filters.search = value;
    if (levelFilter !== "all")
      filters.requiredLevel = Number(levelFilter) as 1 | 2 | 3;
    const data = await getMatches(filters);
    setMatches(data);
  }

  async function handleLevelChange(value: string) {
    setLevelFilter(value);
    const filters: MatchFilters = {};
    if (search) filters.search = search;
    if (value !== "all") filters.requiredLevel = Number(value) as 1 | 2 | 3;
    const data = await getMatches(filters);
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
