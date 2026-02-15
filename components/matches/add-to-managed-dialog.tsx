"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { batchCreateManagedTeams } from "@/lib/actions/managed-teams";
import { useTranslations } from "next-intl";

type Props = {
  open: boolean;
  teams: string[];
  onDone: () => void;
};

export function AddToManagedDialog({ open, teams, onDone }: Props) {
  const t = useTranslations("matches");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(teams));
  const [levels, setLevels] = useState<Record<string, 1 | 2 | 3>>(() =>
    Object.fromEntries(teams.map((name) => [name, 1])),
  );
  const [saving, setSaving] = useState(false);

  function toggleTeam(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  async function handleAdd() {
    setSaving(true);
    try {
      await batchCreateManagedTeams(
        teams
          .filter((name) => selected.has(name))
          .map((name) => ({ name, requiredLevel: levels[name] ?? 1 })),
      );
      onDone();
    } catch {
      toast.error(t("addToManagedError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addToManagedTitle")}</DialogTitle>
          <DialogDescription>{t("addToManagedDescription")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {teams.map((name) => {
            const checked = selected.has(name);
            return (
              <label
                key={name}
                className={`flex items-center justify-between gap-4 ${
                  checked ? "" : "opacity-50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleTeam(name)}
                  />
                  <span className="text-sm">{name}</span>
                </div>
                <Select
                  value={String(levels[name])}
                  disabled={!checked}
                  onValueChange={(v) =>
                    setLevels((prev) => ({
                      ...prev,
                      [name]: Number(v) as 1 | 2 | 3,
                    }))
                  }
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t("levelAny")}</SelectItem>
                    <SelectItem value="2">{t("levelExperienced")}</SelectItem>
                    <SelectItem value="3">{t("levelTop")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex gap-2 justify-end">
          <Button variant="ghost" onClick={onDone}>
            {t("addToManagedSkip")}
          </Button>
          <Button onClick={handleAdd} disabled={saving || selected.size === 0}>
            {saving ? t("saving") : t("addToManagedConfirm")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
