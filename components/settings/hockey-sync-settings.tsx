"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { HockeyTeamPickerDialog } from "@/components/settings/hockey-team-picker-dialog";
import { getTrackedTeams, untrackTeam } from "@/lib/actions/hockey-teams";
import type { TrackedTeam } from "@/lib/types/domain";

type Props = {
  initialTeams: TrackedTeam[];
  canEdit?: boolean;
};

export function HockeySyncSettings({ initialTeams, canEdit = true }: Props) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const [teams, setTeams] = useState<TrackedTeam[]>(initialTeams);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [teamToRemove, setTeamToRemove] = useState<TrackedTeam | null>(null);
  const [removing, setRemoving] = useState(false);

  const byClub = useMemo(() => {
    const groups = new Map<string, TrackedTeam[]>();
    for (const team of teams) {
      const list = groups.get(team.club_name) ?? [];
      list.push(team);
      groups.set(team.club_name, list);
    }
    return Array.from(groups.entries());
  }, [teams]);

  async function refresh() {
    try {
      setTeams(await getTrackedTeams());
    } catch {
      // keep current list; next page load recovers
    }
  }

  async function handleRemove() {
    if (!teamToRemove) return;
    setRemoving(true);
    try {
      await untrackTeam(teamToRemove.id);
      setTeams((prev) => prev.filter((team) => team.id !== teamToRemove.id));
      setTeamToRemove(null);
    } catch {
      toast.error(t("hockeySyncUntrackError"));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{t("hockeySyncSubtitle")}</p>
      {teams.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          {t("hockeySyncEmpty")}
        </p>
      ) : (
        <div className="space-y-4">
          {byClub.map(([clubName, clubTeams]) => (
            <div key={clubName}>
              <h3 className="mb-1 text-sm font-medium">{clubName}</h3>
              <ul className="divide-y rounded-md border">
                {clubTeams.map((team) => (
                  <li
                    key={team.id}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-sm">{team.team_name}</span>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTeamToRemove(team)}
                        aria-label={t("hockeySyncUntrack")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          {t("hockeySyncAddTeam")}
        </Button>
      )}

      <HockeyTeamPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onTracked={refresh}
      />

      <AlertDialog
        open={teamToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setTeamToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("hockeySyncUntrack")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("hockeySyncUntrackConfirm", {
                team: teamToRemove?.team_name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={removing}>
              {t("hockeySyncUntrack")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
