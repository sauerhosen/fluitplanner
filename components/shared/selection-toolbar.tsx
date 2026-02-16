"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

interface SelectionToolbarProps {
  selectedCount: number;
  onDelete: () => Promise<void>;
  onClearSelection: () => void;
  children?: React.ReactNode;
}

export function SelectionToolbar({
  selectedCount,
  onDelete,
  onClearSelection,
  children,
}: SelectionToolbarProps) {
  const [deleting, setDeleting] = useState(false);
  const tCommon = useTranslations("common");

  async function handleConfirmedDelete() {
    setDeleting(true);
    try {
      await onDelete();
    } catch {
      toast.error(tCommon("bulkDeleteError"));
    } finally {
      setDeleting(false);
    }
  }

  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2">
      <span className="text-sm font-medium">
        {tCommon("selectedCount", { count: selectedCount })}
      </span>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" disabled={deleting}>
            <Trash2 className="mr-2 h-4 w-4" />
            {deleting ? tCommon("deleting") : tCommon("deleteSelected")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tCommon("deleteSelected")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tCommon("bulkDeleteConfirm", { count: selectedCount })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmedDelete}>
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {children}
      <Button variant="ghost" size="sm" onClick={onClearSelection}>
        {tCommon("clearSelection")}
      </Button>
    </div>
  );
}
