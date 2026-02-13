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

  const [date, setDate] = useState(match?.date ?? "");
  const [startTime, setStartTime] = useState(
    match?.start_time
      ? new Date(match.start_time).toLocaleTimeString("nl-NL", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "",
  );
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
        start_time: startTime ? `${date}T${startTime}:00` : null,
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
          <DialogTitle>{isEditing ? "Edit Match" : "Add Match"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="time">Time</Label>
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
              <Label htmlFor="home">Home Team</Label>
              <Input
                id="home"
                value={homeTeam}
                onChange={(e) => setHomeTeam(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="away">Away Team</Label>
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
              <Label htmlFor="field">Field</Label>
              <Input
                id="field"
                value={field}
                onChange={(e) => setField(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venue">Venue</Label>
              <Input
                id="venue"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="competition">Competition</Label>
              <Input
                id="competition"
                value={competition}
                onChange={(e) => setCompetition(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="level">Required Level</Label>
              <Select value={requiredLevel} onValueChange={setRequiredLevel}>
                <SelectTrigger id="level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Any</SelectItem>
                  <SelectItem value="2">2 — Experienced</SelectItem>
                  <SelectItem value="3">3 — Top</SelectItem>
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
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : isEditing ? "Update" : "Add"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
