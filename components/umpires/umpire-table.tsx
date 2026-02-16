"use client";

import { useState } from "react";
import type { Umpire } from "@/lib/types/domain";
import { deleteUmpire, deleteUmpires } from "@/lib/actions/umpires";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Pencil, Trash2, Check, X, Inbox } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSelection } from "@/hooks/use-selection";
import { SelectionToolbar } from "@/components/shared/selection-toolbar";

const LEVEL_LABEL_KEYS: Record<
  number,
  "levelLabelAny" | "levelLabelExperienced" | "levelLabelTop"
> = {
  1: "levelLabelAny",
  2: "levelLabelExperienced",
  3: "levelLabelTop",
};

const LEVEL_VARIANTS: Record<number, "default" | "secondary" | "destructive"> =
  {
    1: "secondary",
    2: "default",
    3: "destructive",
  };

export function UmpireTable({
  umpires,
  onEdit,
  onDeleted,
}: {
  umpires: Umpire[];
  onEdit: (umpire: Umpire) => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("umpires");
  const tCommon = useTranslations("common");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const {
    selectedIds,
    toggleSelection,
    toggleAll,
    clearSelection,
    allChecked,
    someChecked,
  } = useSelection(umpires, (u) => u.id);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteUmpire(id);
      onDeleted();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleBulkDelete() {
    await deleteUmpires([...selectedIds]);
    clearSelection();
    onDeleted();
  }

  if (umpires.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
        <Inbox className="h-10 w-10" />
        <p>{t("emptyState")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SelectionToolbar
        selectedCount={selectedIds.size}
        onDelete={handleBulkDelete}
        onClearSelection={clearSelection}
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={
                    allChecked ? true : someChecked ? "indeterminate" : false
                  }
                  onCheckedChange={toggleAll}
                  aria-label={tCommon("selectAll")}
                />
              </TableHead>
              <TableHead>{t("nameHeader")}</TableHead>
              <TableHead>{t("emailHeader")}</TableHead>
              <TableHead className="w-32">{t("levelHeader")}</TableHead>
              <TableHead className="w-20">{t("verifiedHeader")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {umpires.map((umpire) => (
              <TableRow
                key={umpire.id}
                data-selected={selectedIds.has(umpire.id) || undefined}
                className="data-[selected]:bg-primary/5"
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(umpire.id)}
                    onCheckedChange={() => toggleSelection(umpire.id)}
                    aria-label={umpire.name}
                  />
                </TableCell>
                <TableCell className="font-medium">{umpire.name}</TableCell>
                <TableCell>{umpire.email}</TableCell>
                <TableCell>
                  <Badge variant={LEVEL_VARIANTS[umpire.level]}>
                    {t(LEVEL_LABEL_KEYS[umpire.level])}
                  </Badge>
                </TableCell>
                <TableCell>
                  {umpire.auth_user_id ? (
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">{t("moreActions")}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(umpire)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t("edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(umpire.id)}
                        disabled={deletingId === umpire.id}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {tCommon("delete")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
