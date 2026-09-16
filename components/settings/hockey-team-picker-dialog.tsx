"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Loader2, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ClubTeamBrowser } from "@/components/hockey/club-team-browser";
import { trackTeam, type ClubTeamOption } from "@/lib/actions/hockey-teams";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTracked: () => void;
};

export function HockeyTeamPickerDialog({
  open,
  onOpenChange,
  onTracked,
}: Props) {
  const t = useTranslations("settings");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("hockeySyncAddTeam")}</DialogTitle>
          <DialogDescription>{t("hockeySyncAddTeamHint")}</DialogDescription>
        </DialogHeader>
        {/* The picker is mounted only while the dialog is open — this dialog
            itself stays mounted, so every bit of sitting-scoped state below
            (the club search, and what was tracked in it) lives in there and
            is dropped on close. */}
        {open && <TeamPicker onTracked={onTracked} />}
      </DialogContent>
    </Dialog>
  );
}

function TeamPicker({ onTracked }: { onTracked: () => void }) {
  const t = useTranslations("settings");
  const [trackingId, setTrackingId] = useState<number | null>(null);
  // Teams tracked in this sitting: the browser holds the upstream list, which
  // still carries the `tracked` flag as it was when the club was opened.
  const [justTracked, setJustTracked] = useState<number[]>([]);

  async function handleTrack(
    team: ClubTeamOption,
    club: { id: string; name: string },
  ) {
    setTrackingId(team.teamId);
    try {
      await trackTeam({
        clubId: club.id,
        clubName: club.name,
        teamId: team.teamId,
        teamName: team.name,
        hockeyType: team.hockeyType,
        recentPouleId: team.recentPouleId,
      });
      setJustTracked((prev) => [...prev, team.teamId]);
      onTracked();
    } catch (error) {
      const message =
        error instanceof Error && error.message === "ALREADY_TRACKED"
          ? t("hockeySyncAlreadyTracked")
          : t("hockeySyncTrackError");
      toast.error(message);
    } finally {
      setTrackingId(null);
    }
  }

  return (
    <ClubTeamBrowser
      renderTeam={(team, club) => (
        <div className="flex items-center justify-between rounded-md px-2 py-1.5">
          <span className="text-sm">{team.name}</span>
          {team.tracked || justTracked.includes(team.teamId) ? (
            <span className="text-muted-foreground flex items-center gap-1 text-sm">
              <Check className="h-4 w-4" />
              {t("hockeySyncTracked")}
            </span>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={trackingId !== null}
              onClick={() => handleTrack(team, club)}
            >
              {trackingId === team.teamId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t("hockeySyncTrack")}
            </Button>
          )}
        </div>
      )}
    />
  );
}
