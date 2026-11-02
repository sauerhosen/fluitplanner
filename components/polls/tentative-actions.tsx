"use client";

import type { Dispatch, SetStateAction } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useIsPlanner } from "@/components/shared/role-provider";
import {
  clearTentativeAssignments,
  confirmTentativeAssignments,
} from "@/lib/actions/assignments";
import type { Assignment } from "@/lib/types/domain";

/** Dashed icon strokes, matching the grid's tentative cells. */
const DASHED_STROKE = "[stroke-dasharray:3_2]";

type Props = {
  pollId: string;
  assignments: Assignment[];
  onAssignmentsChange: Dispatch<SetStateAction<Assignment[]>>;
  /** Shared with the grid, so cell clicks wait while a bulk write runs. */
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
};

/**
 * The poll's tentative appointments, counted, with confirm-all and clear-all.
 * Sits in the toolbar beside the Confirmed / Tentative switch that creates
 * them, and stays there whether or not the grid is on screen — an empty
 * filter must not hide that drafts exist. Renders nothing until there is
 * something tentative; a viewer sees the count without the actions.
 */
export function TentativeActions({
  pollId,
  assignments,
  onAssignmentsChange,
  pending,
  onPendingChange,
}: Props) {
  const t = useTranslations("polls");
  const canEdit = useIsPlanner();
  const count = assignments.filter((a) => a.status === "tentative").length;

  async function run(
    optimistic: (prev: Assignment[]) => Assignment[],
    action: (pollId: string) => Promise<number>,
    successKey: "tentativeConfirmed" | "tentativeCleared",
  ) {
    if (pending) return;
    const snapshot = assignments;
    onPendingChange(true);
    onAssignmentsChange(optimistic);
    try {
      const done = await action(pollId);
      toast.success(t(successKey, { count: done }));
    } catch {
      onAssignmentsChange(snapshot);
      toast.error(t("failedToSaveAssignment"));
    } finally {
      onPendingChange(false);
    }
  }

  if (count === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
      <span
        className="flex items-center gap-1.5 whitespace-nowrap tabular-nums"
        data-testid="tentative-summary"
        title={t("tentativeSummary", { count })}
      >
        <span className="flex h-4 w-4 items-center justify-center rounded outline-2 outline-dashed outline-primary/70 -outline-offset-2">
          <Check className={`h-3 w-3 text-primary/60 ${DASHED_STROKE}`} />
        </span>
        {t("tentativeCount", { count })}
      </span>
      {canEdit && (
        <span className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2"
            data-testid="confirm-tentative"
            disabled={pending}
            onClick={() =>
              run(
                (prev) =>
                  prev.map((a) =>
                    a.status === "tentative"
                      ? { ...a, status: "confirmed" }
                      : a,
                  ),
                confirmTentativeAssignments,
                "tentativeConfirmed",
              )
            }
          >
            {t("confirmAllTentative")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            data-testid="clear-tentative"
            disabled={pending}
            onClick={() =>
              run(
                (prev) => prev.filter((a) => a.status !== "tentative"),
                clearTentativeAssignments,
                "tentativeCleared",
              )
            }
          >
            {t("clearTentative")}
          </Button>
        </span>
      )}
    </div>
  );
}
