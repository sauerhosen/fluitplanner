"use client";

import { useState, useCallback } from "react";
import type { RosteredUmpire } from "@/lib/types/domain";
import type { UmpireFilters } from "@/lib/actions/umpires";
import { getUmpires } from "@/lib/actions/umpires";
import { UmpireTable } from "./umpire-table";
import { UmpireFormDialog } from "./umpire-form";
import { UmpireMergeDialog } from "./umpire-merge-dialog";
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
import { PageHeader } from "@/components/shared/page-header";
import { StickyToolbar } from "@/components/shared/sticky-toolbar";
import { useTranslations } from "next-intl";

export function UmpiresPageClient({
  initialUmpires,
}: {
  initialUmpires: RosteredUmpire[];
}) {
  const t = useTranslations("umpires");
  const [umpires, setUmpires] = useState(initialUmpires);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [editingUmpire, setEditingUmpire] = useState<RosteredUmpire | null>(
    null,
  );
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [mergingUmpire, setMergingUmpire] = useState<RosteredUmpire | null>(
    null,
  );

  const refreshUmpires = useCallback(async () => {
    const filters: UmpireFilters = {};
    if (search) filters.search = search;
    if (levelFilter !== "all") filters.level = Number(levelFilter) as 1 | 2 | 3;
    const data = await getUmpires(filters);
    setUmpires(data);
  }, [search, levelFilter]);

  async function handleSearchChange(value: string) {
    setSearch(value);
    const filters: UmpireFilters = {};
    if (value) filters.search = value;
    if (levelFilter !== "all") filters.level = Number(levelFilter) as 1 | 2 | 3;
    const data = await getUmpires(filters);
    setUmpires(data);
  }

  async function handleLevelChange(value: string) {
    setLevelFilter(value);
    const filters: UmpireFilters = {};
    if (search) filters.search = search;
    if (value !== "all") filters.level = Number(value) as 1 | 2 | 3;
    const data = await getUmpires(filters);
    setUmpires(data);
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={
          <h1 className="truncate text-xl font-semibold">{t("pageTitle")}</h1>
        }
        actions={
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addUmpire")}
          </Button>
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
      </StickyToolbar>

      <UmpireTable
        umpires={umpires}
        onEdit={(umpire) => setEditingUmpire(umpire)}
        onMerge={(umpire) => setMergingUmpire(umpire)}
        onDeleted={refreshUmpires}
        onNoteSaved={refreshUmpires}
      />

      {/* Add dialog — mounted only while open, so each opening starts blank
          rather than holding on to the last umpire's details and note. */}
      {showAddDialog && (
        <UmpireFormDialog
          umpire={null}
          open={true}
          onOpenChange={setShowAddDialog}
          onSaved={refreshUmpires}
        />
      )}

      {/* Merge dialog — mounted per opening for the same reason as the add
          dialog: it holds the chosen counterpart and merge direction. */}
      {mergingUmpire && (
        <UmpireMergeDialog
          umpire={mergingUmpire}
          open={true}
          onOpenChange={(open) => {
            if (!open) setMergingUmpire(null);
          }}
          onMerged={refreshUmpires}
        />
      )}

      {/* Edit dialog */}
      {editingUmpire && (
        <UmpireFormDialog
          umpire={editingUmpire}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingUmpire(null);
          }}
          onSaved={refreshUmpires}
        />
      )}
    </div>
  );
}
