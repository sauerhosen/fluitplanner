"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  Match,
  RosteredUmpire,
  Assignment,
  AvailabilityResponse,
} from "@/lib/types/domain";
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
import { PageHeader } from "@/components/shared/page-header";
import { StickyToolbar } from "@/components/shared/sticky-toolbar";
import { useIsPlanner } from "@/components/shared/role-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MatchNoteButton } from "@/components/matches/match-note-button";
import { FeatureMatchButton } from "./feature-match-button";
import { getUmpiresForPoll } from "@/lib/actions/assignments";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Pencil,
  PencilLine,
  Check,
  Trash2,
  ArrowRightLeft,
  MoreHorizontal,
  Lock,
  LockOpen,
  ChevronLeft,
} from "lucide-react";
import { ExportDropdown } from "./export-dropdown";
import { PollToolbarMenu } from "./poll-toolbar-menu";
import { useTranslations, useFormatter } from "next-intl";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import type { DateRange } from "react-day-picker";
import { format as fnsFormat } from "date-fns";

type Props = {
  initialPoll: PollDetail;
  availableMatches: Match[];
  umpires: RosteredUmpire[];
  /** Own club name, stripped from home team labels in the assignment grid. */
  clubName?: string | null;
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
  umpires: initialUmpires,
  clubName,
}: Props) {
  const router = useRouter();
  const [poll, setPoll] = useState(initialPoll);
  const [umpires, setUmpires] = useState(initialUmpires);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(poll.title ?? "");
  const [editingMatches, setEditingMatches] = useState(false);
  const [selectedMatchIds, setSelectedMatchIds] = useState(
    poll.matches.map((m) => m.id),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once umpires have answered, the assignment grid is what a planner opens the
  // poll for, so it becomes the landing tab.
  const [activeTab, setActiveTab] = useState(
    initialPoll.responses.length > 0 ? "assignments" : "matches",
  );
  const [transposed, setTransposed] = useState(true);
  const [tentativeMode, setTentativeMode] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [liveAssignments, setLiveAssignments] = useState<Assignment[]>(
    initialPoll.assignments,
  );
  const [liveResponses, setLiveResponses] = useState<AvailabilityResponse[]>(
    initialPoll.responses,
  );
  const t = useTranslations("polls");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  // Viewers get the poll to read: date range, exports, tabs and the grids in
  // read mode. Everything that changes the poll — its title, status, matches,
  // featured matches, notes, share link — stays off the page. Server actions
  // enforce the role; this only keeps dead controls out of the way.
  const canEdit = useIsPlanner();

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

  const filteredMatches = useMemo(() => {
    if (!dateRange?.from) return poll.matches;
    const from = fnsFormat(dateRange.from, "yyyy-MM-dd");
    const to = dateRange.to ? fnsFormat(dateRange.to, "yyyy-MM-dd") : from;
    return poll.matches.filter((m) => m.date >= from && m.date <= to);
  }, [poll.matches, dateRange]);

  const filteredSlots = useMemo(() => {
    if (!dateRange?.from) return poll.slots;
    const from = fnsFormat(dateRange.from, "yyyy-MM-dd");
    const to = dateRange.to ? fnsFormat(dateRange.to, "yyyy-MM-dd") : from;
    return poll.slots.filter((s) => {
      const slotDate = fnsFormat(new Date(s.start_time), "yyyy-MM-dd");
      return slotDate >= from && slotDate <= to;
    });
  }, [poll.slots, dateRange]);

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
    setLiveAssignments(updated.assignments);
    setLiveResponses(updated.responses);
  }, [poll.id]);

  const featuredMatchIds = useMemo(
    () => new Set(poll.featuredMatchIds),
    [poll.featuredMatchIds],
  );

  // The toggle already wrote to the database, so fold the result into local
  // state rather than refetching the whole poll for one boolean.
  const handleFeatureToggled = useCallback(
    (matchId: string, featured: boolean) => {
      setPoll((prev) => ({
        ...prev,
        featuredMatchIds: featured
          ? [...new Set([...prev.featuredMatchIds, matchId])]
          : prev.featuredMatchIds.filter((id) => id !== matchId),
      }));
    },
    [],
  );

  // Umpires arrive as a prop from the server, so an umpire note edited in the
  // assignment grid needs its own refetch to be read back.
  const refreshUmpires = useCallback(async () => {
    setUmpires(await getUmpiresForPoll(poll.id));
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

  const handleResponseChange = useCallback(
    (
      slotId: string,
      umpireId: string,
      response: "yes" | "if_need_be" | "no" | null,
    ) => {
      setLiveResponses((prev) => {
        const idx = prev.findIndex(
          (r) => r.slot_id === slotId && r.umpire_id === umpireId,
        );
        if (response === null) {
          return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
        }
        if (idx >= 0) {
          return prev.map((r, i) => (i === idx ? { ...r, response } : r));
        }
        // Find participant name from existing responses or umpires list
        const name =
          prev.find((r) => r.umpire_id === umpireId)?.participant_name ??
          umpires.find((u) => u.id === umpireId)?.name ??
          "";
        return [
          ...prev,
          {
            id: `live-${slotId}-${umpireId}`,
            poll_id: poll.id,
            slot_id: slotId,
            participant_name: name,
            response,
            umpire_id: umpireId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      });
    },
    [poll.id, umpires],
  );

  const uniqueRespondentCount = [
    ...new Set(poll.responses.map((r) => r.participant_name)),
  ].length;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* One identity row: where you are, what state it is in, what you came
          to do. Everything rarer lives behind the overflow menu. */}
      <PageHeader
        backHref="/protected/polls"
        backLabel={t("pageTitle")}
        status={
          <Badge
            variant={poll.status === "open" ? "default" : "secondary"}
            className="shrink-0"
          >
            {poll.status === "open" ? t("statusOpen") : t("statusClosed")}
          </Badge>
        }
        title={
          !canEdit ? (
            <h1 className="min-w-0 text-lg font-semibold sm:text-xl">
              <span className="block truncate">{poll.title}</span>
            </h1>
          ) : editingTitle ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="h-9 text-lg font-semibold"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
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
            // The heading wraps the button, not the other way round: a button
            // takes its name from its contents, so a heading nested inside one
            // is both invalid markup and invisible to heading navigation.
            <h1 className="min-w-0 text-lg font-semibold sm:text-xl">
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(poll.title ?? "");
                  setEditingTitle(true);
                }}
                title={t("editTitle")}
                className="group flex max-w-full min-w-0 items-center gap-1.5 text-left"
              >
                <span className="truncate">{poll.title}</span>
                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
              </button>
            </h1>
          )
        }
        actions={
          canEdit ? (
            <>
              <SharePollButton token={poll.token} variant="menu" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label={t("moreActions")}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onSelect={() => {
                      setTitleDraft(poll.title ?? "");
                      setEditingTitle(true);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    {t("editTitle")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={handleToggleStatus}
                    disabled={saving}
                  >
                    {poll.status === "open" ? (
                      <Lock className="mr-2 h-4 w-4" />
                    ) : (
                      <LockOpen className="mr-2 h-4 w-4" />
                    )}
                    {poll.status === "open" ? t("closePoll") : t("reopenPoll")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={handleDelete}
                    disabled={saving}
                    variant="destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {tCommon("delete")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : undefined
        }
      />

      {/* Matches, Responses & Assignments */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <StickyToolbar
          compact={
            <>
              <Link
                href="/protected/polls"
                className="flex min-w-0 items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4 shrink-0" />
                <span className="truncate">{poll.title}</span>
              </Link>
              <span aria-hidden className="mx-3 h-4 w-px shrink-0 bg-border" />
            </>
          }
          className="justify-between"
        >
          <TabsList>
            {/* The counts are the widest part of the row and the least urgent,
                so a phone gets the bare labels and the tools keep their seat. */}
            <TabsTrigger value="matches">
              <span className="sm:hidden">{t("matchesTabShort")}</span>
              <span className="hidden sm:inline">
                {t("matchesTab", { count: filteredMatches.length })}
              </span>
            </TabsTrigger>
            <TabsTrigger value="responses">
              <span className="sm:hidden">{t("responsesTabShort")}</span>
              <span className="hidden sm:inline">
                {t("responsesTab", { count: uniqueRespondentCount })}
              </span>
            </TabsTrigger>
            <TabsTrigger value="assignments">{t("assignmentsTab")}</TabsTrigger>
          </TabsList>
          <PollToolbarMenu
            className="sm:hidden"
            pollTitle={poll.title ?? ""}
            slots={filteredSlots}
            matches={filteredMatches}
            responses={liveResponses}
            assignments={liveAssignments}
            umpires={umpires}
            activeTab={activeTab}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            tentativeMode={tentativeMode}
            onTentativeModeChange={setTentativeMode}
            onSwapAxes={() => setTransposed((prev) => !prev)}
          />
          <div className="hidden items-center gap-2 sm:flex">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
            <ExportDropdown
              pollTitle={poll.title ?? ""}
              slots={filteredSlots}
              matches={filteredMatches}
              responses={liveResponses}
              assignments={liveAssignments}
              umpires={umpires}
              activeTab={activeTab}
            />
            {activeTab === "assignments" && (
              <>
                {canEdit && (
                  <Button
                    variant={tentativeMode ? "default" : "outline"}
                    size="sm"
                    aria-pressed={tentativeMode}
                    data-testid="tentative-mode-toggle"
                    title={t("tentativeModeHint")}
                    onClick={() => setTentativeMode((prev) => !prev)}
                  >
                    <PencilLine className="mr-2 h-4 w-4" />
                    {t("tentativeMode")}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTransposed((prev) => !prev)}
                  aria-label={t("swapRowsAndColumns")}
                >
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  {t("swapAxes")}
                </Button>
              </>
            )}
          </div>
        </StickyToolbar>
        <TabsContent value="matches">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Label>{t("slotsLabel", { count: filteredSlots.length })}</Label>
              {canEdit && (
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
              )}
            </div>

            {canEdit && editingMatches ? (
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
                  const sortedSlots = filteredSlots
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
                          const slotMatches = filteredMatches.filter((m) => {
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
                                  hour12: false,
                                })}
                                {" – "}
                                {format.dateTime(new Date(slot.end_time), {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: false,
                                })}
                              </div>
                              {slotMatches.length > 0 ? (
                                <div className="divide-y px-3">
                                  {slotMatches.map((match) => (
                                    <div
                                      key={match.id}
                                      className="flex items-center justify-between gap-2 py-1.5 text-sm"
                                    >
                                      <span>
                                        {match.home_team} – {match.away_team}
                                      </span>
                                      <div className="flex items-center gap-1">
                                        {match.start_time && (
                                          <span className="text-muted-foreground text-xs">
                                            {format.dateTime(
                                              new Date(match.start_time),
                                              {
                                                hour: "2-digit",
                                                minute: "2-digit",
                                                hour12: false,
                                              },
                                            )}
                                          </span>
                                        )}
                                        <FeatureMatchButton
                                          pollId={poll.id}
                                          matchId={match.id}
                                          featured={featuredMatchIds.has(
                                            match.id,
                                          )}
                                          disabled={!match.start_time}
                                          onToggled={handleFeatureToggled}
                                        />
                                        <MatchNoteButton
                                          match={match}
                                          variant={
                                            canEdit ? "editor" : "indicator"
                                          }
                                          readOnly={!canEdit}
                                          onSaved={refreshPoll}
                                        />
                                      </div>
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
            slots={filteredSlots}
            responses={poll.responses}
            onResponseChange={handleResponseChange}
          />
        </TabsContent>
        <TabsContent value="assignments">
          <AssignmentGrid
            pollId={poll.id}
            matches={filteredMatches}
            slots={filteredSlots}
            responses={poll.responses}
            assignments={poll.assignments}
            umpires={umpires}
            transposed={transposed}
            tentativeMode={tentativeMode}
            clubName={clubName}
            onAssignmentsChange={setLiveAssignments}
            onNoteSaved={refreshPoll}
            onUmpireNoteSaved={refreshUmpires}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
