"use client";

import { useTranslations } from "next-intl";
import { updateUmpireNotes } from "@/lib/actions/umpires";
import { NoteButton } from "@/components/shared/note-button";

export type NotableUmpire = {
  id: string;
  name: string;
  notes: string | null;
};

type Props = {
  umpire: NotableUmpire;
  /**
   * "indicator" renders nothing when the umpire has no note — for dense views
   * (the assignment grid) where an empty affordance per umpire would be noise.
   * "editor" always renders a trigger so a note can be added.
   */
  variant?: "indicator" | "editor";
  readOnly?: boolean;
  className?: string;
  /**
   * Callers pass an async refetch; it is awaited so a failed refresh reports
   * an error instead of closing the dialog over stale content.
   */
  onSaved?: (umpireId: string, notes: string | null) => void | Promise<void>;
};

export function UmpireNoteButton({
  umpire,
  variant = "indicator",
  readOnly = false,
  className,
  onSaved,
}: Props) {
  const t = useTranslations("umpires");
  const tCommon = useTranslations("common");

  return (
    <NoteButton
      note={umpire.notes}
      variant={variant}
      readOnly={readOnly}
      className={className}
      labels={{
        add: t("noteAdd"),
        dialogTitle: t("noteDialogTitle", { umpire: umpire.name }),
        fieldLabel: t("notesLabel"),
        placeholder: t("notesPlaceholder"),
        saveError: t("noteSaveError"),
        saving: t("saving"),
        save: tCommon("save"),
        cancel: tCommon("cancel"),
        delete: tCommon("delete"),
      }}
      onSave={async (body) => {
        await updateUmpireNotes(umpire.id, body);
        await onSaved?.(umpire.id, body.trim() || null);
      }}
    />
  );
}
