"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Match } from "@/lib/types/domain";
import type { PollDetail } from "@/lib/actions/polls";
import {
  getPoll,
  updatePollTitle,
  updatePollMatches,
  togglePollStatus,
  deletePoll,
} from "@/lib/actions/polls";
import { groupMatchesIntoSlots } from "@/lib/domain/slots";
import { MatchSelector } from "./match-selector";
import { SlotPreview } from "./slot-preview";
import { ResponseSummary } from "./response-summary";
import { SharePollButton } from "./share-poll-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, Trash2 } from "lucide-react";

type Props = {
  initialPoll: PollDetail;
  availableMatches: Match[];
};

export function PollDetailClient({ initialPoll, availableMatches }: Props) {
  const router = useRouter();
  const [poll, setPoll] = useState(initialPoll);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(poll.title ?? "");
  const [editingMatches, setEditingMatches] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState(
    poll.matches.map((m) => m.id),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelectableMatches = useMemo(() => {
    const pollMatchIds = new Set(poll.matches.map((m) => m.id));
    const combined = [...poll.matches];
    for (const m of availableMatches) {
      if (!pollMatchIds.has(m.id)) combined.push(m);
    }
    combined.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.start_time ?? "").localeCompare(b.start_time ?? "");
    });
    return combined;
  }, [poll.matches, availableMatches]);

  const previewSlots = useMemo(() => {
    if (!editingMatches) return [];
    const selected = allSelectableMatches.filter((m) =>
      selectedMatchIds.includes(m.id),
    );
    const withStartTime = selected.filter((m) => m.start_time);
    return groupMatchesIntoSlots(withStartTime as { start_time: string }[]);
  }, [editingMatches, selectedMatchIds, allSelectableMatches]);

  const refreshPoll = useCallback(async () => {
    const updated = await getPoll(poll.id);
    setPoll(updated);
  }, [poll.id]);

  async function handleSaveTitle() {
    setSaving(true);
    setError(null);
    try {
      await updatePollTitle(poll.id, titleDraft);
      await refreshPoll();
      setEditingTitle(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update title");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMatches() {
    setSaving(true);
    setError(null);
    try {
      await updatePollMatches(poll.id, selectedMatchIds);
      await refreshPoll();
      setEditingMatches(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update matches");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    setSaving(true);
    try {
      await togglePollStatus(poll.id);
      await refreshPoll();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this poll? All responses will be lost.")) return;
    setSaving(true);
    await deletePoll(poll.id);
    router.push("/protected/polls");
  }

  return (
    <div className="flex flex-col gap-8">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Header: title + status + actions */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="text-xl font-bold"
                autoFocus
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={handleSaveTitle}
                disabled={saving}
                aria-label="Save title"
              >
                <Check className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{poll.title}</h1>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setTitleDraft(poll.title ?? "");
                  setEditingTitle(true);
                }}
                aria-label="Edit title"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={poll.status === "open" ? "default" : "secondary"}>
            {poll.status === "open" ? "Open" : "Closed"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleStatus}
            disabled={saving}
          >
            {poll.status === "open" ? "Close Poll" : "Reopen Poll"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={saving}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Share */}
      <div className="flex flex-col gap-2">
        <Label>Share Link</Label>
        <SharePollButton token={poll.token} />
      </div>

      {/* Matches */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Matches ({poll.matches.length})</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (editingMatches) {
                setSelectedMatchIds(poll.matches.map((m) => m.id));
                setEditingMatches(false);
              } else {
                setSelectedMatchIds(poll.matches.map((m) => m.id));
                setEditingMatches(true);
              }
            }}
          >
            {editingMatches ? "Cancel" : "Edit Matches"}
          </Button>
        </div>

        {editingMatches ? (
          <div className="flex flex-col gap-4">
            <MatchSelector
              matches={allSelectableMatches}
              selectedIds={selectedMatchIds}
              onSelectionChange={setSelectedMatchIds}
            />
            <div className="flex flex-col gap-2">
              <Label>Updated Time Slots Preview</Label>
              <SlotPreview slots={previewSlots} />
            </div>
            <Button onClick={handleSaveMatches} disabled={saving}>
              {saving ? "Saving..." : "Save Match Changes"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {poll.matches.map((match) => (
              <div
                key={match.id}
                className="border-b py-1 text-sm last:border-0"
              >
                <span className="font-medium">
                  {match.home_team} – {match.away_team}
                </span>
                {match.start_time && (
                  <span className="text-muted-foreground ml-2">
                    {new Date(match.start_time).toLocaleString("nl-NL", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Time Slots */}
      {!editingMatches && (
        <div className="flex flex-col gap-2">
          <Label>Time Slots ({poll.slots.length})</Label>
          <SlotPreview
            slots={poll.slots.map((s) => ({
              start: new Date(s.start_time),
              end: new Date(s.end_time),
            }))}
          />
        </div>
      )}

      {/* Responses */}
      <div className="flex flex-col gap-2">
        <Label>
          Responses (
          {[...new Set(poll.responses.map((r) => r.participant_name))].length}{" "}
          umpires)
        </Label>
        <ResponseSummary slots={poll.slots} responses={poll.responses} />
      </div>
    </div>
  );
}
