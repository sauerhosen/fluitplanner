"use client";

import { useState } from "react";
import type { RosteredUmpire } from "@/lib/types/domain";
import { createUmpire, updateUmpire } from "@/lib/actions/umpires";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_NOTE_LENGTH } from "@/lib/domain/notes";
import { useTranslations } from "next-intl";

export function UmpireFormDialog({
  umpire,
  open,
  onOpenChange,
  onSaved,
}: {
  umpire: RosteredUmpire | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("umpires");
  const tCommon = useTranslations("common");
  const isEditing = umpire !== null;

  const [name, setName] = useState(umpire?.name ?? "");
  const [email, setEmail] = useState(umpire?.email ?? "");
  const [level, setLevel] = useState<string>(String(umpire?.level ?? 1));
  const [notes, setNotes] = useState(umpire?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State is seeded from props at mount, so every caller must mount a fresh
  // dialog per opening (see UmpiresPageClient) — otherwise the previous
  // umpire's details, their note included, are still sitting in the form.

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email) return;

    setSaving(true);
    setError(null);
    try {
      const umpireData = {
        name,
        email,
        level: Number(level) as 1 | 2 | 3,
      };

      if (isEditing) {
        // The note has its own editor on the Umpires screen, so it can change
        // while this dialog sits open. Send it only when this form actually
        // touched it, rather than writing back a stale snapshot.
        const noteChanged = notes.trim() !== (umpire.notes ?? "").trim();
        await updateUmpire(
          umpire.id,
          noteChanged ? { ...umpireData, notes } : umpireData,
        );
      } else {
        await createUmpire({ ...umpireData, notes });
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("editUmpire") : t("addUmpire")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t("nameLabel")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t("emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="level">{t("levelLabel")}</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger id="level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("levelAny")}</SelectItem>
                <SelectItem value="2">{t("levelExperienced")}</SelectItem>
                <SelectItem value="3">{t("levelTop")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t("notesLabel")}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={MAX_NOTE_LENGTH}
              placeholder={t("notesPlaceholder")}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? t("saving") : isEditing ? t("update") : t("add")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
