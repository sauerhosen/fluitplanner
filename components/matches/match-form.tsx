"use client";

import { useState } from "react";
import type { Match } from "@/lib/types/domain";
import { createMatch, updateMatch } from "@/lib/actions/matches";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";

export function MatchFormDialog({
  match,
  open,
  onOpenChange,
  onSaved,
}: {
  match: Match | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEditing = match !== null;
  const t = useTranslations("matches");
  const tCommon = useTranslations("common");

  const [date, setDate] = useState(match?.date ?? "");
  const [startTime, setStartTime] = useState(() => {
    if (!match?.start_time) return "";
    const d = new Date(match.start_time);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [homeTeam, setHomeTeam] = useState(match?.home_team ?? "");
  const [awayTeam, setAwayTeam] = useState(match?.away_team ?? "");
  const [venue, setVenue] = useState(match?.venue ?? "");
  const [field, setField] = useState(match?.field ?? "");
  const [competition, setCompetition] = useState(match?.competition ?? "");
  const [requiredLevel, setRequiredLevel] = useState<string>(
    String(match?.required_level ?? 1),
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !homeTeam || !awayTeam) return;

    setSaving(true);
    try {
      const matchData = {
        date,
        start_time: startTime
          ? new Date(`${date}T${startTime}`).toISOString()
          : null,
        home_team: homeTeam,
        away_team: awayTeam,
        venue: venue || null,
        field: field || null,
        competition: competition || null,
        required_level: Number(requiredLevel) as 1 | 2 | 3,
      };

      if (isEditing) {
        await updateMatch(match.id, matchData);
      } else {
        await createMatch(matchData);
      }
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("editMatch") : t("addMatch")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">{t("dateLabel")}</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">{t("timeLabel")}</Label>
              <Input
                id="time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="home">{t("homeTeamLabel")}</Label>
              <Input
                id="home"
                value={homeTeam}
                onChange={(e) => setHomeTeam(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="away">{t("awayTeamLabel")}</Label>
              <Input
                id="away"
                value={awayTeam}
                onChange={(e) => setAwayTeam(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="field">{t("fieldLabel")}</Label>
              <Input
                id="field"
                value={field}
                onChange={(e) => setField(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venue">{t("venueLabel")}</Label>
              <Input
                id="venue"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="competition">{t("competitionLabel")}</Label>
              <Input
                id="competition"
                value={competition}
                onChange={(e) => setCompetition(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="level">{t("requiredLevelLabel")}</Label>
              <Select value={requiredLevel} onValueChange={setRequiredLevel}>
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
          </div>

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
