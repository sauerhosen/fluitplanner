"use client";

import { useState } from "react";
import { StickyNote, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";
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

/**
 * Every user-visible string the note affordance needs. Passed in rather than
 * read from a namespace so the same control can serve notes on matches and on
 * umpires, which name and describe their notes differently.
 */
export type NoteButtonLabels = {
  /** Accessible name of the trigger when there is no note yet. */
  add: string;
  dialogTitle: string;
  /** Accessible name of the textarea. */
  fieldLabel: string;
  placeholder: string;
  saveError: string;
  saving: string;
  save: string;
  cancel: string;
  delete: string;
};

type Props = {
  note: string | null;
  labels: NoteButtonLabels;
  /**
   * Persists the note body ("" clears it) and refreshes whatever shows it.
   * Awaited, so a failed write or refetch reports an error and leaves the
   * dialog open rather than closing over stale content.
   */
  onSave: (body: string) => void | Promise<void>;
  /**
   * "indicator" renders nothing when there is no note — for dense views (the
   * assignment grid) where an empty affordance per row would be noise.
   * "editor" always renders a trigger so a note can be added.
   */
  variant?: "indicator" | "editor";
  readOnly?: boolean;
  className?: string;
};

export function NoteButton({
  note: rawNote,
  labels,
  onSave,
  variant = "indicator",
  readOnly = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(rawNote ?? "");
  const [saving, setSaving] = useState(false);

  const note = rawNote?.trim() ?? "";
  const hasNote = note.length > 0;

  if (!hasNote && variant === "indicator") return null;

  async function save(body: string) {
    setSaving(true);
    try {
      await onSave(body);
      setOpen(false);
    } catch {
      toast.error(labels.saveError);
    } finally {
      setSaving(false);
    }
  }

  const label = hasNote ? note : labels.add;

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
        setDraft(rawNote ?? "");
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
              <DialogTitle>{labels.dialogTitle}</DialogTitle>
            </DialogHeader>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              maxLength={MAX_NOTE_LENGTH}
              aria-label={labels.fieldLabel}
              placeholder={labels.placeholder}
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
                  {labels.delete}
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
                  {labels.cancel}
                </Button>
                <Button
                  type="button"
                  disabled={saving}
                  onClick={() => save(draft)}
                >
                  {saving ? labels.saving : labels.save}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
