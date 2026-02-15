"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PollWithMeta } from "@/lib/actions/polls";
import { deletePoll, deletePolls } from "@/lib/actions/polls";
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
import { MoreHorizontal, Eye, Trash2, Inbox } from "lucide-react";
import { SharePollButton } from "./share-poll-button";
import { useTranslations, useFormatter } from "next-intl";

export function PollTable({
  polls,
  onDeleted,
}: {
  polls: PollWithMeta[];
  onDeleted: () => void;
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const t = useTranslations("polls");
  const tCommon = useTranslations("common");
  const format = useFormatter();

  function formatDateRange(min: string | null, max: string | null): string {
    if (!min) return "\u2014";
    const fmt = (d: string) =>
      format.dateTime(new Date(d + "T00:00:00"), {
        day: "numeric",
        month: "short",
      });
    if (min === max) return fmt(min);
    return `${fmt(min)} \u2013 ${fmt(max!)}`;
  }

  async function handleDelete(id: string) {
    if (!confirm(t("deleteConfirm"))) return;
    setDeletingId(id);
    try {
      await deletePoll(id);
      onDeleted();
    } finally {
      setDeletingId(null);
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === polls.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(polls.map((p) => p.id)));
    }
  }

  async function handleBulkDelete() {
    if (!confirm(tCommon("bulkDeleteConfirm", { count: selectedIds.size })))
      return;
    setBulkDeleting(true);
    try {
      await deletePolls([...selectedIds]);
      setSelectedIds(new Set());
      onDeleted();
    } finally {
      setBulkDeleting(false);
    }
  }

  if (polls.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
        <Inbox className="h-10 w-10" />
        <p>{t("emptyState")}</p>
      </div>
    );
  }

  const allChecked = selectedIds.size === polls.length;
  const someChecked = selectedIds.size > 0 && !allChecked;

  return (
    <div className="flex flex-col gap-3">
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-muted/50 px-4 py-2">
          <span className="text-sm font-medium">
            {tCommon("selectedCount", { count: selectedIds.size })}
          </span>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {bulkDeleting ? tCommon("deleting") : tCommon("deleteSelected")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            {tCommon("clearSelection")}
          </Button>
        </div>
      )}
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
              <TableHead>{t("titleHeader")}</TableHead>
              <TableHead>{t("datesHeader")}</TableHead>
              <TableHead className="w-24">{t("statusHeader")}</TableHead>
              <TableHead className="w-24">{t("responsesHeader")}</TableHead>
              <TableHead className="w-40">{t("shareHeader")}</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {polls.map((poll) => (
              <TableRow
                key={poll.id}
                data-selected={selectedIds.has(poll.id) || undefined}
                className="data-[selected]:bg-primary/5"
              >
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(poll.id)}
                    onCheckedChange={() => toggleSelection(poll.id)}
                    aria-label={poll.title ?? undefined}
                  />
                </TableCell>
                <TableCell
                  className="font-medium cursor-pointer hover:underline"
                  onClick={() => router.push(`/protected/polls/${poll.id}`)}
                >
                  {poll.title}
                </TableCell>
                <TableCell>
                  {formatDateRange(poll.match_date_min, poll.match_date_max)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={poll.status === "open" ? "default" : "secondary"}
                  >
                    {poll.status === "open"
                      ? t("statusOpen")
                      : t("statusClosed")}
                  </Badge>
                </TableCell>
                <TableCell>{poll.response_count}</TableCell>
                <TableCell>
                  <SharePollButton token={poll.token} />
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
                      <DropdownMenuItem
                        onClick={() =>
                          router.push(`/protected/polls/${poll.id}`)
                        }
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        {t("viewDetails")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDelete(poll.id)}
                        disabled={deletingId === poll.id}
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
