"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Match, Umpire } from "@/lib/types/domain";
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
import { AssignmentGrid } from "./assignment-grid";
import { SharePollButton } from "./share-poll-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Pencil, Check, Trash2, ArrowRightLeft } from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";

type Props = {
  initialPoll: PollDetail;
  availableMatches: Match[];
  umpires: Umpire[];
};

/**
 * Render a client-side poll detail editor and viewer with tabs for matches, responses, and assignments.
 *
 * Provides UI and controls to view and edit the poll title and selected matches, toggle poll status,
 * delete the poll, preview and group time slots, share the poll link, and inspect responses and assignments.
 *
 * @param initialPoll - Initial poll data used to populate local state and render the poll details
 * @param availableMatches - Matches available to add to the poll (combined with poll's existing matches for selection)
 * @param umpires - List of umpires passed through to the assignments view
 * @returns A React element rendering the poll detail interface and its interactive controls
 */
export function PollDetailClient({
  initialPoll,
  availableMatches,
  umpires,
}: Props) {
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
  const [activeTab, setActiveTab] = useState("matches");
  const [transposed, setTransposed] = useState(false);
  const t = useTranslations("polls");
  const tCommon = useTranslations("common");
  const format = useFormatter();

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
      setError(err instanceof Error ? err.message : t("failedToUpdateTitle"));
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
      setError(err instanceof Error ? err.message : t("failedToUpdateMatches"));
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
    if (!confirm(t("deleteConfirm"))) return;
    setSaving(true);
    await deletePoll(poll.id);
    router.push("/protected/polls");
  }

  const uniqueRespondentCount = [
    ...new Set(poll.responses.map((r) => r.participant_name)),
  ].length;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Header: title + status + actions */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex-1 min-w-0">
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
                aria-label={t("saveTitle")}
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
                aria-label={t("editTitle")}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={poll.status === "open" ? "default" : "secondary"}>
            {poll.status === "open" ? t("statusOpen") : t("statusClosed")}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleToggleStatus}
            disabled={saving}
          >
            {poll.status === "open" ? t("closePoll") : t("reopenPoll")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={saving}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {tCommon("delete")}
          </Button>
        </div>
      </div>

      {/* Share */}
      <div className="flex flex-col gap-2">
        <Label>{t("shareLinkLabel")}</Label>
        <SharePollButton token={poll.token} />
      </div>

      {/* Matches, Responses & Assignments */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-2 overflow-x-auto">
          <TabsList>
            <TabsTrigger value="matches">
              {t("matchesTab", { count: poll.matches.length })}
            </TabsTrigger>
            <TabsTrigger value="responses">
              {t("responsesTab", { count: uniqueRespondentCount })}
            </TabsTrigger>
            <TabsTrigger value="assignments">{t("assignmentsTab")}</TabsTrigger>
          </TabsList>
          {activeTab === "assignments" && (
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => setTransposed((t) => !t)}
              aria-label={t("swapRowsAndColumns")}
            >
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              {t("swapAxes")}
            </Button>
          )}
        </div>
        <TabsContent value="matches">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Label>{t("slotsLabel", { count: poll.slots.length })}</Label>
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
                {editingMatches ? tCommon("cancel") : t("editMatches")}
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
                  <Label>{t("updatedSlotsPreview")}</Label>
                  <SlotPreview slots={previewSlots} />
                </div>
                <Button onClick={handleSaveMatches} disabled={saving}>
                  {saving ? t("saving") : t("saveMatchChanges")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {(() => {
                  const sortedSlots = poll.slots
                    .slice()
                    .sort(
                      (a, b) =>
                        new Date(a.start_time).getTime() -
                        new Date(b.start_time).getTime(),
                    );
                  const dateGroups: {
                    dateKey: string;
                    label: string;
                    slots: typeof sortedSlots;
                  }[] = [];
                  for (const slot of sortedSlots) {
                    const dateKey = new Date(slot.start_time).toDateString();
                    const last = dateGroups[dateGroups.length - 1];
                    if (last && last.dateKey === dateKey) {
                      last.slots.push(slot);
                    } else {
                      dateGroups.push({
                        dateKey,
                        label: format.dateTime(new Date(slot.start_time), {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        }),
                        slots: [slot],
                      });
                    }
                  }
                  return dateGroups.map((group) => (
                    <div key={group.dateKey}>
                      <div className="text-muted-foreground mb-2 text-xs font-semibold uppercase tracking-wide">
                        {group.label}
                      </div>
                      <div className="flex flex-col gap-2">
                        {group.slots.map((slot) => {
                          const slotStart = new Date(slot.start_time).getTime();
                          const slotEnd = new Date(slot.end_time).getTime();
                          const slotMatches = poll.matches.filter((m) => {
                            if (!m.start_time) return false;
                            const mt = new Date(m.start_time).getTime();
                            return mt >= slotStart && mt < slotEnd;
                          });
                          return (
                            <div key={slot.id} className="rounded-lg border">
                              <div className="bg-muted px-3 py-2 text-sm font-medium">
                                {format.dateTime(new Date(slot.start_time), {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                                {" – "}
                                {format.dateTime(new Date(slot.end_time), {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                              {slotMatches.length > 0 ? (
                                <div className="divide-y px-3">
                                  {slotMatches.map((match) => (
                                    <div
                                      key={match.id}
                                      className="flex items-baseline justify-between py-1.5 text-sm"
                                    >
                                      <span>
                                        {match.home_team} – {match.away_team}
                                      </span>
                                      {match.start_time && (
                                        <span className="text-muted-foreground text-xs">
                                          {format.dateTime(
                                            new Date(match.start_time),
                                            {
                                              hour: "2-digit",
                                              minute: "2-digit",
                                            },
                                          )}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-muted-foreground px-3 py-1.5 text-sm">
                                  {t("noMatchesInSlot")}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="responses">
          <ResponseSummary
            pollId={poll.id}
            slots={poll.slots}
            responses={poll.responses}
          />
        </TabsContent>
        <TabsContent value="assignments">
          <AssignmentGrid
            pollId={poll.id}
            matches={poll.matches}
            slots={poll.slots}
            responses={poll.responses}
            assignments={poll.assignments}
            umpires={umpires}
            transposed={transposed}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
