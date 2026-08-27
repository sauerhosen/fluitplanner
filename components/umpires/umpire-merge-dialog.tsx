"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RosteredUmpire } from "@/lib/types/domain";
import {
  getUmpireMergePreview,
  getUmpires,
  mergeUmpires,
} from "@/lib/actions/umpires";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, ArrowLeftRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

/**
 * Fold a duplicate umpire — nearly always the product of a mistyped email on a
 * poll — into the record that survives.
 *
 * The planner opens this from the row they want to keep, so that row starts as
 * the survivor and they pick the duplicate to absorb. Direction is the one
 * thing that cannot be undone afterwards, so it is spelled out in words and
 * stays swappable right up to the confirm.
 */
export function UmpireMergeDialog({
  umpire,
  open,
  onOpenChange,
  onMerged,
}: {
  /** The row the planner opened the menu on; the survivor until they swap. */
  umpire: RosteredUmpire;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMerged: () => void | Promise<void>;
}) {
  const t = useTranslations("umpires");
  const tCommon = useTranslations("common");

  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<RosteredUmpire[] | null>(null);
  /** The roster could not be read; say so instead of loading forever. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [counterpart, setCounterpart] = useState<RosteredUmpire | null>(null);
  /** True once the planner has flipped which of the two records survives. */
  const [swapped, setSwapped] = useState(false);
  /**
   * Counts, tagged with the umpire they were counted for. Swapping the
   * direction changes which record is being deleted, so a count that no longer
   * matches is simply ignored rather than cleared — that keeps the stale figure
   * from being read as the new one without a second render to blank it.
   */
  const [preview, setPreview] = useState<{
    forUmpireId: string;
    responses: number;
    assignments: number;
  } | null>(null);
  /** The umpire whose counts could not be read, tagged the same way. */
  const [previewFailedFor, setPreviewFailedFor] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const surviving = swapped && counterpart ? counterpart : umpire;
  const disappearing = swapped ? umpire : counterpart;

  // Candidates are fetched rather than taken from the table, so a duplicate
  // hidden by the page's own search or level filter is still reachable.
  const latestSearch = useRef(0);
  const loadCandidates = useCallback(
    (term: string) => {
      const request = ++latestSearch.current;
      return getUmpires(term ? { search: term } : {})
        .then((rows) => {
          // A slower earlier request must not overwrite a later one's results.
          if (request !== latestSearch.current) return;
          setLoadFailed(false);
          setCandidates(rows.filter((row) => row.id !== umpire.id));
        })
        .catch(() => {
          // Say so rather than spinning forever: without this a roster that
          // never arrives leaves the list on "loading" for good, and the
          // rejection goes unhandled.
          if (request !== latestSearch.current) return;
          setLoadFailed(true);
        });
    },
    [umpire.id],
  );

  useEffect(() => {
    if (!open) return;
    loadCandidates("");
  }, [open, loadCandidates]);

  useEffect(() => {
    if (!disappearing) return;
    let current = true;
    const forUmpireId = disappearing.id;
    getUmpireMergePreview(forUmpireId)
      .then((result) => {
        if (current) setPreview({ forUmpireId, ...result });
      })
      .catch(() => {
        // A count that cannot be read is not worth blocking the merge over,
        // but it must not sit on the spinner for good either: say the figures
        // are unavailable and let the planner merge on the rest, which already
        // spells out what is about to happen.
        if (current) setPreviewFailedFor(forUmpireId);
      });
    return () => {
      current = false;
    };
  }, [disappearing]);

  const counts =
    preview && preview.forUmpireId === disappearing?.id ? preview : null;
  const countsFailed = previewFailedFor === disappearing?.id;

  async function handleSearchChange(value: string) {
    setSearch(value);
    await loadCandidates(value);
  }

  async function handleMerge() {
    if (!disappearing) return;
    setMerging(true);
    setError(null);

    let summary;
    try {
      summary = await mergeUmpires(surviving.id, disappearing.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("mergeError"));
      setMerging(false);
      return;
    }

    // Past this point the merge has happened and cannot be retried: nothing
    // that fails while closing up may be reported as a failed merge, or the
    // planner merges again and is told the umpire no longer exists.
    toast.success(t("mergeSuccess", { umpire: surviving.name }));
    // A dropped appointment means both records were on the same match, so that
    // match is now an umpire short — the planner has to hear about it.
    if (summary.assignmentsDropped > 0) {
      toast.warning(
        t("mergeDroppedAppointments", { count: summary.assignmentsDropped }),
      );
    }
    try {
      await onMerged();
    } catch {
      // The list behind the dialog is stale, not wrong; it reloads on the
      // next navigation.
    }
    setMerging(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("mergeDialogTitle")}</DialogTitle>
          <DialogDescription>
            {counterpart
              ? t("mergeConfirmDescription")
              : t("mergePickDescription", { umpire: umpire.name })}
          </DialogDescription>
        </DialogHeader>

        {counterpart === null ? (
          <div className="flex flex-col gap-3">
            <Input
              autoFocus
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t("mergeSearchPlaceholder")}
            />
            <div className="max-h-72 overflow-y-auto rounded-md border">
              {loadFailed ? (
                <p className="p-4 text-sm text-destructive">
                  {tCommon("error")}
                </p>
              ) : candidates === null ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {tCommon("loading")}
                </p>
              ) : candidates.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {search ? t("mergeNoMatches") : t("mergeNoCandidates")}
                </p>
              ) : (
                <ul>
                  {candidates.map((candidate) => (
                    <li key={candidate.id}>
                      <button
                        type="button"
                        onClick={() => setCounterpart(candidate)}
                        className="flex w-full flex-col items-start gap-0.5 border-b px-4 py-2 text-left last:border-b-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                      >
                        <span className="text-sm font-medium">
                          {candidate.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {candidate.email}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <UmpireSide
                label={t("mergeRemoves")}
                umpire={disappearing!}
                tone="removed"
              />
              <ArrowRight
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <UmpireSide
                label={t("mergeKeeps")}
                umpire={surviving}
                tone="kept"
              />
            </div>

            <div className="flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSwapped((value) => !value)}
                disabled={merging}
              >
                <ArrowLeftRight className="mr-2 h-4 w-4" />
                {t("mergeSwap")}
              </Button>
            </div>

            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <p>
                {countsFailed ? (
                  <span className="text-muted-foreground">
                    {t("mergeMovesUnknown")}
                  </span>
                ) : counts === null ? (
                  <span className="inline-flex items-center gap-2 text-muted-foreground">
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    {t("mergeMovesLoading")}
                  </span>
                ) : (
                  t("mergeMovesSummary", {
                    responses: counts.responses,
                    assignments: counts.assignments,
                  })
                )}
              </p>
              <p className="mt-2 text-muted-foreground">
                {t("mergeConflictNote")}
              </p>
              <p className="mt-2 font-medium text-destructive">
                {t("mergeWarning", { umpire: disappearing!.name })}
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setCounterpart(null);
                  setSwapped(false);
                  setError(null);
                }}
                disabled={merging}
              >
                {t("mergeChangeSelection")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleMerge}
                disabled={merging}
              >
                {merging ? t("mergeInProgress") : t("mergeConfirm")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UmpireSide({
  label,
  umpire,
  tone,
}: {
  label: string;
  umpire: RosteredUmpire;
  tone: "kept" | "removed";
}) {
  return (
    <div className="min-w-0 flex-1 rounded-md border p-3">
      <p
        className={
          tone === "removed"
            ? "text-xs font-medium uppercase tracking-wide text-destructive"
            : "text-xs font-medium uppercase tracking-wide text-muted-foreground"
        }
      >
        {label}
      </p>
      <p
        className={
          tone === "removed"
            ? "truncate text-sm font-medium line-through"
            : "truncate text-sm font-medium"
        }
      >
        {umpire.name}
      </p>
      <p className="truncate text-xs text-muted-foreground">{umpire.email}</p>
    </div>
  );
}
