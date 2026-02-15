"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useTranslations } from "next-intl";

type Props = {
  teams: string[];
  managedTeamNames: string[];
  onConfirm: (selectedTeams: string[]) => void;
  onCancel: () => void;
};

export function TeamSelector({
  teams,
  managedTeamNames,
  onConfirm,
  onCancel,
}: Props) {
  const t = useTranslations("matches");
  const tCommon = useTranslations("common");
  const managedSet = new Set(managedTeamNames);

  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(managedTeamNames.filter((name) => teams.includes(name))),
  );

  function toggle(team: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(team)) {
        next.delete(team);
      } else {
        next.add(team);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(teams));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  const managedCount = teams.filter((name) => managedSet.has(name)).length;
  const additionalCount =
    selected.size -
    teams.filter((name) => managedSet.has(name) && selected.has(name)).length;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{t("teamSelectorTitle")}</h3>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={selectAll}>
            {t("teamSelectorSelectAll")}
          </Button>
          <Button variant="ghost" size="sm" onClick={deselectAll}>
            {t("teamSelectorDeselectAll")}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("teamSelectorSummary", {
          total: teams.length,
          managed: managedCount,
          additional: additionalCount,
        })}
      </p>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {teams.map((team) => (
          <label
            key={team}
            className="flex items-center gap-3 py-1 cursor-pointer"
          >
            <Checkbox
              checked={selected.has(team)}
              onCheckedChange={() => toggle(team)}
            />
            <span className="text-sm">{team}</span>
            {managedSet.has(team) && (
              <Badge variant="secondary">{t("teamSelectorManaged")}</Badge>
            )}
          </label>
        ))}
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>
          {tCommon("cancel")}
        </Button>
        <Button
          onClick={() => onConfirm(Array.from(selected))}
          disabled={selected.size === 0}
        >
          {t("teamSelectorContinue")}
        </Button>
      </div>
    </Card>
  );
}
