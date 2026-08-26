"use client";

import { useState } from "react";
import { StickyNote, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
import { updateMatchNotes } from "@/lib/actions/matches";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MAX_NOTE_LENGTH } from "@/lib/domain/notes";
import { useTranslations } from "next-intl";

export type NotableMatch = {
  id: string;
  home_team: string;
  away_team: string;
  notes: string | null;
};

type Props = {
  match: NotableMatch;
  /**
   * "indicator" renders nothing when the match has no note — for dense views
   * (the assignment grid) where an empty affordance per match would be noise.
   * "editor" always renders a trigger so a note can be added.
   */
  variant?: "indicator" | "editor";
  readOnly?: boolean;
  className?: string;
  /**
   * Callers pass an async refetch; it is awaited so a failed refresh reports
   * an error instead of closing the dialog over stale content.
   */
  onSaved?: (matchId: string, notes: string | null) => void | Promise<void>;
};

export function MatchNoteButton({
  match,
  variant = "indicator",
  readOnly = false,
  className,
  onSaved,
}: Props) {
  const t = useTranslations("matches");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(match.notes ?? "");
  const [saving, setSaving] = useState(false);

  const note = match.notes?.trim() ?? "";
  const hasNote = note.length > 0;

  if (!hasNote && variant === "indicator") return null;

  async function save(body: string) {
    setSaving(true);
    try {
      await updateMatchNotes(match.id, body);
      await onSaved?.(match.id, body.trim() || null);
      setOpen(false);
    } catch {
      toast.error(t("noteSaveError"));
    } finally {
      setSaving(false);
    }
  }

  const label = hasNote ? note : t("noteAdd");

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      className={`h-6 w-6 shrink-0 ${hasNote ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"} ${className ?? ""}`}
      onClick={(e) => {
        e.stopPropagation();
        if (readOnly) return;
        setDraft(match.notes ?? "");
        setOpen(true);
      }}
    >
      {hasNote ? (
        <StickyNote className="h-4 w-4" />
      ) : (
        <MessageSquarePlus className="h-4 w-4" />
      )}
    </Button>
  );

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent className="max-w-64 whitespace-pre-wrap text-left">
          {label}
        </TooltipContent>
      </Tooltip>

      {!readOnly && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("noteDialogTitle", {
                  match: `${match.home_team} – ${match.away_team}`,
                })}
              </DialogTitle>
            </DialogHeader>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              maxLength={MAX_NOTE_LENGTH}
              aria-label={t("notesLabel")}
              placeholder={t("notesPlaceholder")}
              autoFocus
            />
            <div className="flex justify-between gap-2">
              {hasNote ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive"
                  disabled={saving}
                  onClick={() => save("")}
                >
                  {tCommon("delete")}
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                >
                  {tCommon("cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => save(draft)}
                >
                  {saving ? t("saving") : tCommon("save")}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
