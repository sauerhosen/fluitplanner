"use client";

import { useState, useCallback } from "react";
import type { Umpire } from "@/lib/types/domain";
import type { UmpireFilters } from "@/lib/actions/umpires";
import { getUmpires } from "@/lib/actions/umpires";
import { UmpireTable } from "./umpire-table";
import { UmpireFormDialog } from "./umpire-form";
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

export function UmpiresPageClient({
  initialUmpires,
}: {
  initialUmpires: Umpire[];
}) {
  const t = useTranslations("umpires");
  const [umpires, setUmpires] = useState(initialUmpires);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [editingUmpire, setEditingUmpire] = useState<Umpire | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

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
    <div className="flex flex-col gap-6">
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
            {t("addUmpire")}
          </Button>
        </div>
      </div>

      <UmpireTable
        umpires={umpires}
        onEdit={(umpire) => setEditingUmpire(umpire)}
        onDeleted={refreshUmpires}
      />

      {/* Add dialog */}
      <UmpireFormDialog
        umpire={null}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSaved={refreshUmpires}
      />

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
