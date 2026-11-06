"use client";

import { useState, useMemo, useCallback, useRef } from "react";
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
import { mapMatchesToSlots } from "@/lib/domain/match-slot-mapping";
import { countDiscardedResponses } from "@/lib/domain/carry-over-responses";
import { withoutHidden } from "@/lib/domain/hidden-matches";
import { onlyRespondingUmpires } from "@/lib/domain/responding-umpires";
import { setPollMatchesHidden } from "@/lib/actions/hidden-matches";
import { setPollDayClosed } from "@/lib/actions/closed-days";
import { amsterdamDay } from "@/lib/domain/closed-days";
import { toast } from "sonner";
import { MatchSelector } from "./match-selector";
import { SlotPreview } from "./slot-preview";
import { DiscardedAnswersWarning } from "./discarded-answers-warning";
import { ResponseSummary } from "./response-summary";
import { AssignmentGrid } from "./assignment-grid";
import { PollShareMenu } from "./poll-share-menu";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Pencil,
  PencilLine,
  Check,
  X,
  Trash2,
  ArrowRightLeft,
  MoreHorizontal,
  Lock,
  LockOpen,
  ChevronLeft,
  Eye,
  EyeOff,
  CalendarCheck,
  CalendarOff,
} from "lucide-react";
import { DateRangeMenu } from "./date-range-menu";
import { TentativeActions } from "./tentative-actions";
import { useMediaQuery } from "@/hooks/use-media-query";
import { UmpireFilterMenu } from "./umpire-filter-menu";
import { cn } from "@/lib/utils";
import { useTranslations, useFormatter } from "next-intl";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import type { DateRange } from "react-day-picker";
import { format as fnsFormat } from "date-fns";
import {
  dayRangePredicate,
  nextTwoWeeksRange,
} from "@/hooks/use-date-range-presets";

type Props = {
  initialPoll: PollDetail;
  availableMatches: Match[];
  umpires: RosteredUmpire[];
  /** The whole club roster, including umpires who have not answered this poll. */
  roster?: RosteredUmpire[];
  /** Own club name, stripped from home team labels in the assignment grid. */
  clubName?: string | null;
};

// A stable fallback, so an omitted roster does not change the identity of every
// callback that depends on it on each render.
const NO_UMPIRES: RosteredUmpire[] = [];

type PollView = "matches" | "responses" | "assignments";

/** Beyond this many picked umpires the toolbar shows one summary chip. */
const MAX_UMPIRE_CHIPS = 3;

/**
 * Render a client-side poll detail editor and viewer. The assignment grid is the page; the match
 * list and the responses are secondary views reached from the counts beside the title.
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
  roster = NO_UMPIRES,
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
  // poll for, so it is the page; the match list and responses are side views.
  const [view, setView] = useState<PollView>(
    initialPoll.responses.length > 0 ? "assignments" : "matches",
  );
  // A bulk confirm or clear of tentative appointments is in flight; the grid
  // holds cell clicks until it lands.
  const [bulkPending, setBulkPending] = useState(false);
  const [transposed, setTransposed] = useState(true);
  const [tentativeMode, setTentativeMode] = useState(false);
  // Talking to a few umpires: the grid narrows to their rows alone, so a
  // screenshot of it is about them and not the whole roster.
  const [focusedUmpireIds, setFocusedUmpireIds] = useState<string[]>([]);
  // Hide the rows of umpires who left the days in view blank, so the grid
  // shows only the people a planner can actually plan with.
  const [hideSilentUmpires, setHideSilentUmpires] = useState(false);
  // Opens on the next two weeks, the same range as the "next two weeks" preset
  // (midnight bounds, so the toolbar can tell the preset is active).
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() =>
    nextTwoWeeksRange(),
  );
  const [liveAssignments, setLiveAssignments] = useState<Assignment[]>(
    initialPoll.assignments,
  );
  const [liveResponses, setLiveResponses] = useState<AvailabilityResponse[]>(
    initialPoll.responses,
  );
  const t = useTranslations("polls");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  // Viewers get the poll to read: date range, exports, views and the grids in
  // read mode. Everything that changes the poll — its title, status, matches,
  // featured matches, notes, share link — stays off the page. Server actions
  // enforce the role; this only keeps dead controls out of the way.
  const canEdit = useIsPlanner();
  const isSmUp = useMediaQuery("(min-width: 640px)", true);

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
    const inRange = dayRangePredicate(dateRange);
    return poll.matches.filter((m) => inRange(m.date));
  }, [poll.matches, dateRange]);

  const filteredSlots = useMemo(() => {
    if (!dateRange?.from) return poll.slots;
    const inRange = dayRangePredicate(dateRange);
    return poll.slots.filter((s) =>
      inRange(fnsFormat(new Date(s.start_time), "yyyy-MM-dd")),
    );
  }, [poll.slots, dateRange]);

  // Slots overlap, so a kick-off falls inside several windows; list each
  // match under the one slot it belongs to, as the grid and poll page do.
  const slotByMatch = useMemo(
    () => mapMatchesToSlots(poll.matches, poll.slots),
    [poll.matches, poll.slots],
  );

  const previewSlots = useMemo(() => {
    if (!editingMatches) return [];
    const selected = allSelectableMatches.filter((m) =>
      selectedMatchIds.includes(m.id),
    );
    const withStartTime = selected.filter((m) => m.start_time);
    return groupMatchesIntoSlots(withStartTime as { start_time: string }[]);
  }, [editingMatches, selectedMatchIds, allSelectableMatches]);

  // The save carries answers over when a slot only shifts; anything beyond
  // that is deleted, so say how much before the planner commits to it.
  const discardedAnswerCount = useMemo(
    () =>
      editingMatches
        ? countDiscardedResponses(poll.slots, previewSlots, liveResponses)
        : 0,
    [editingMatches, poll.slots, previewSlots, liveResponses],
  );

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

  const hiddenMatchIds = useMemo(
    () => new Set(poll.hiddenMatchIds),
    [poll.hiddenMatchIds],
  );

  // Hidden matches never reach an export: the grid folds them away, and a
  // day sheet listing fixtures the planner set aside would be wrong.
  const exportMatches = useMemo(
    () => withoutHidden(filteredMatches, poll.hiddenMatchIds),
    [filteredMatches, poll.hiddenMatchIds],
  );

  // Optimistic: the column folds on click, and comes back with a toast if the
  // database did not take it.
  const handleSetHidden = useCallback(
    (matchIds: string[], hidden: boolean) => {
      const apply = (prev: PollDetail, on: boolean) => ({
        ...prev,
        hiddenMatchIds: on
          ? [...new Set([...prev.hiddenMatchIds, ...matchIds])]
          : prev.hiddenMatchIds.filter((id) => !matchIds.includes(id)),
      });
      // Hidden matches drop out of exports, so a booked umpire would vanish
      // from the day sheet. Say so before it happens.
      if (hidden) {
        const booked = liveAssignments.filter(
          (a) => a.status === "confirmed" && matchIds.includes(a.match_id),
        ).length;
        if (
          booked > 0 &&
          !confirm(t("hideConfirmedWarning", { count: booked }))
        )
          return;
      }
      setPoll((prev) => apply(prev, hidden));
      setPollMatchesHidden(poll.id, matchIds, hidden)
        .then((result) => {
          if (!result.ok) throw new Error(result.reason);
        })
        .catch(async () => {
          toast.error(t("hideToggleError"));
          // Read the stored flags back rather than flipping the optimistic
          // change: with several toggles in flight, undoing one by applying
          // its opposite can leave the page claiming the wrong state.
          try {
            const fresh = await getPoll(poll.id);
            // A refusal usually means a match left the poll meanwhile, so
            // take its match list and slots too. Answers and assignments stay
            // local: they may hold edits still in flight.
            setPoll((prev) => ({
              ...prev,
              matches: fresh.matches,
              slots: fresh.slots,
              featuredMatchIds: fresh.featuredMatchIds,
              hiddenMatchIds: fresh.hiddenMatchIds,
            }));
          } catch {
            setPoll((prev) => apply(prev, !hidden));
          }
        });
    },
    [poll.id, t, liveAssignments],
  );

  const closedDays = useMemo(() => new Set(poll.closedDays), [poll.closedDays]);

  // Optimistic, like hiding a match: the day flips on click and is read back
  // from the database if the write did not take.
  const handleSetDayClosed = useCallback(
    (day: string, closed: boolean) => {
      const apply = (prev: PollDetail, on: boolean) => ({
        ...prev,
        closedDays: on
          ? [...new Set([...prev.closedDays, day])].sort()
          : prev.closedDays.filter((d) => d !== day),
      });
      setPoll((prev) => apply(prev, closed));
      setPollDayClosed(poll.id, day, closed)
        .then((result) => {
          if (!result.ok) throw new Error(result.reason);
        })
        .catch(async () => {
          toast.error(t("closeDayError"));
          try {
            const fresh = await getPoll(poll.id);
            setPoll((prev) => ({ ...prev, closedDays: fresh.closedDays }));
          } catch {
            setPoll((prev) => apply(prev, !closed));
          }
        });
    },
    [poll.id, t],
  );

  // Umpires arrive as a prop from the server, so an umpire note edited in the
  // assignment grid needs its own refetch to be read back.
  const refreshUmpires = useCallback(async () => {
    setUmpires(await getUmpiresForPoll(poll.id));
  }, [poll.id]);

  // Only the grid narrows. Exports, counts and conflicts keep the whole
  // roster, so a focused grid still reports honestly how full a match is.
  // An umpire that disappears from the roster (a merge, a refetch) silently
  // drops out of the selection rather than leaving an empty row — hence the
  // lookup rather than trusting `focusedUmpireIds` on its own. Roster order,
  // not click order, so the grid reads the same however they were picked.
  const focusedUmpires = useMemo(() => {
    const ids = new Set(focusedUmpireIds);
    return umpires.filter((u) => ids.has(u.id));
  }, [umpires, focusedUmpireIds]);
  const isFocused = focusedUmpires.length > 0;
  // The loaded assignments count too, not only the live ones: a silent umpire
  // kept for an appointment must not lose their row the moment it is cleared,
  // or the planner cannot click the cell again to undo it.
  const gridUmpires = useMemo(() => {
    if (isFocused) return focusedUmpires;
    if (!hideSilentUmpires) return umpires;
    return onlyRespondingUmpires(
      umpires,
      filteredSlots.map((s) => s.id),
      liveResponses,
      [...poll.assignments, ...liveAssignments],
      filteredMatches.map((m) => m.id),
    );
  }, [
    isFocused,
    focusedUmpires,
    hideSilentUmpires,
    umpires,
    filteredSlots,
    liveResponses,
    poll.assignments,
    liveAssignments,
    filteredMatches,
  ]);

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
          roster.find((u) => u.id === umpireId)?.name ??
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
    [poll.id, umpires, roster],
  );

  // A planner answering for an umpire who never opened the poll gives the
  // assignment grid a new row, and its rows come from the server's respondent
  // list — so fetch that list again once the umpire's first answer lands.
  // Only the list: the answers themselves are already in `liveResponses`, and
  // refetching the poll could overwrite edits made while it was in flight.
  // Several quick clicks on a new umpire's row all land before the refetch
  // does, so remember who already triggered one rather than refetching per save.
  const refreshedFor = useRef(new Set<string>());
  const handleResponseSaved = useCallback(
    (umpireId: string) => {
      if (umpires.some((u) => u.id === umpireId)) return;
      if (refreshedFor.current.has(umpireId)) return;
      refreshedFor.current.add(umpireId);
      refreshUmpires().catch(() => {
        // The answer is saved; only the grid row is missing until the next
        // load, so let a later save try again.
        refreshedFor.current.delete(umpireId);
      });
    },
    [umpires, refreshUmpires],
  );

  // One date control, never both: the picker's two-month calendar has nowhere
  // to open on a phone, which gets the presets as a menu instead.
  const dateControls = isSmUp ? (
    <DateRangePicker value={dateRange} onChange={setDateRange} />
  ) : (
    <DateRangeMenu
      className="shrink-0"
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
    />
  );

  function filterChip(
    key: string,
    label: string,
    removeLabel: string,
    onRemove: () => void,
  ) {
    return (
      <span
        key={key}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border bg-accent pl-2.5 pr-1 text-xs"
        data-testid="active-umpire-filter"
      >
        <span className="max-w-40 truncate">{label}</span>
        <button
          type="button"
          aria-label={removeLabel}
          title={removeLabel}
          onClick={onRemove}
          className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  }

  function viewLink(target: Exclude<PollView, "assignments">, label: string) {
    const active = view === target;
    return (
      <button
        type="button"
        aria-pressed={active}
        data-testid={`view-${target}`}
        onClick={() => setView(active ? "assignments" : target)}
        className={cn(
          "rounded px-1 py-0.5 tabular-nums underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-current",
          active && "bg-accent font-medium text-foreground no-underline",
        )}
      >
        {label}
      </button>
    );
  }

  // Count umpires, not names: two umpires can share a name.
  const uniqueRespondentCount = [
    ...new Set(liveResponses.map((r) => r.umpire_id ?? r.participant_name)),
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
        meta={
          // The match list and responses are side views of the grid, reached
          // from their counts. Clicking the open one goes back to the grid.
          <span className="flex shrink-0 items-center gap-0.5 text-sm text-muted-foreground">
            {viewLink(
              "matches",
              t("matchesLink", { count: filteredMatches.length }),
            )}
            <span aria-hidden>·</span>
            {viewLink(
              "responses",
              t("responsesLink", { count: uniqueRespondentCount }),
            )}
          </span>
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
          <>
            <PollShareMenu
              token={poll.token}
              title={poll.title}
              canShareLink={canEdit}
              exportData={{
                pollTitle: poll.title ?? "",
                slots: filteredSlots,
                matches: exportMatches,
                responses: liveResponses,
                assignments: liveAssignments,
                umpires,
              }}
            />
            {canEdit && (
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
            )}
          </>
        }
      />

      {/* Wraps on a phone rather than scrolling sideways, so the bulk
          tentative actions never sit off-screen. */}
      <StickyToolbar
        className="flex-wrap gap-y-2 sm:flex-nowrap"
        compact={
          <>
            <Link
              prefetch={false}
              href="/protected/polls"
              className="flex min-w-0 items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span className="truncate">{poll.title}</span>
            </Link>
            <span aria-hidden className="mx-3 h-4 w-px shrink-0 bg-border" />
          </>
        }
      >
        {view !== "assignments" ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 px-2"
              onClick={() => setView("assignments")}
              data-testid="back-to-assignments"
            >
              <ChevronLeft className="h-4 w-4" />
              {t("assignmentsTab")}
            </Button>
            <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
            <span className="shrink-0 text-sm font-medium">
              {view === "matches"
                ? t("matchesTabShort")
                : t("responsesTabShort")}
            </span>
            {dateControls}
            {view === "matches" && canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto shrink-0"
                onClick={() => {
                  setSelectedMatchIds(poll.matches.map((m) => m.id));
                  setEditingMatches((prev) => !prev);
                }}
              >
                {editingMatches ? tCommon("cancel") : t("editMatches")}
              </Button>
            )}
          </>
        ) : (
          <>
            {dateControls}
            {isFocused && focusedUmpires.length <= MAX_UMPIRE_CHIPS
              ? focusedUmpires.map((u) =>
                  filterChip(
                    u.id,
                    u.name,
                    `${t("removeFilter")}: ${u.name}`,
                    () =>
                      setFocusedUmpireIds((prev) =>
                        prev.filter((id) => id !== u.id),
                      ),
                  ),
                )
              : isFocused
                ? // A long selection would push the mode switch off the bar;
                  // the corner menu still lists who is picked.
                  filterChip(
                    "selected",
                    t("umpiresSelected", { count: focusedUmpires.length }),
                    t("removeFilter"),
                    () => setFocusedUmpireIds([]),
                  )
                : hideSilentUmpires &&
                  filterChip(
                    "responders",
                    t("hideSilentUmpires"),
                    t("removeFilter"),
                    () => setHideSilentUmpires(false),
                  )}
            <div className="ml-auto flex shrink-0 items-center gap-3">
              {canEdit && (
                <div
                  role="group"
                  aria-label={t("assignMode")}
                  title={t("tentativeModeHint")}
                  className="inline-flex shrink-0 overflow-hidden rounded-md border bg-background"
                >
                  <button
                    type="button"
                    aria-pressed={!tentativeMode}
                    data-testid="confirmed-mode-toggle"
                    onClick={() => setTentativeMode(false)}
                    className={cn(
                      "h-8 px-2.5 text-xs transition-colors",
                      !tentativeMode
                        ? "bg-accent font-semibold text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t("assignModeConfirmed")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={tentativeMode}
                    data-testid="tentative-mode-toggle"
                    onClick={() => setTentativeMode(true)}
                    className={cn(
                      "flex h-8 items-center gap-1.5 border-l px-2.5 text-xs transition-colors",
                      tentativeMode
                        ? "bg-accent font-semibold text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <PencilLine className="h-3.5 w-3.5" />
                    {t("assignModeTentative")}
                  </button>
                </div>
              )}
              {!isFocused && (
                // Hidden while umpires are picked: it counts everyone's
                // sketches and says they are hidden from umpires, which is
                // not something to paste into a message to one of them.
                <TentativeActions
                  pollId={poll.id}
                  assignments={liveAssignments}
                  onAssignmentsChange={setLiveAssignments}
                  pending={bulkPending}
                  onPendingChange={setBulkPending}
                />
              )}
            </div>
          </>
        )}
      </StickyToolbar>

      {view === "matches" && (
        <div className="flex flex-col gap-4">
          <Label>{t("slotsLabel", { count: filteredSlots.length })}</Label>
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
              <DiscardedAnswersWarning count={discardedAnswerCount} />
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
                // Keyed by the Amsterdam date: that is the day a planner
                // closes, whatever timezone the browser is in.
                const dateGroups: {
                  dateKey: string;
                  label: string;
                  slots: typeof sortedSlots;
                }[] = [];
                for (const slot of sortedSlots) {
                  const dateKey = amsterdamDay(slot.start_time);
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
                return dateGroups.map((group) => {
                  const isClosed = closedDays.has(group.dateKey);
                  return (
                    <div
                      key={group.dateKey}
                      data-testid={`day-${group.dateKey}`}
                      data-closed={isClosed || undefined}
                    >
                      <div className="mb-2 flex min-h-7 items-center gap-2">
                        <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
                          {group.label}
                        </span>
                        {isClosed && (
                          <Badge
                            variant="outline"
                            className="font-normal"
                            title={t("closedDayHint")}
                          >
                            <CalendarOff className="h-3 w-3" />
                            {t("closedDayBadge")}
                          </Badge>
                        )}
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="ml-auto h-7 px-2 text-xs text-muted-foreground"
                            aria-pressed={isClosed}
                            title={t("closedDayHint")}
                            data-testid={`toggle-day-closed-${group.dateKey}`}
                            onClick={() =>
                              handleSetDayClosed(group.dateKey, !isClosed)
                            }
                          >
                            {isClosed ? (
                              <CalendarCheck className="h-3.5 w-3.5" />
                            ) : (
                              <CalendarOff className="h-3.5 w-3.5" />
                            )}
                            {isClosed ? t("reopenDay") : t("closeDay")}
                          </Button>
                        )}
                      </div>
                      <div
                        className={cn(
                          "flex flex-col gap-2",
                          isClosed && "opacity-60",
                        )}
                      >
                        {group.slots.map((slot) => {
                          const slotMatches = filteredMatches.filter(
                            (m) => slotByMatch.get(m.id) === slot.id,
                          );
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
                                  {slotMatches.map((match) => {
                                    const isHidden = hiddenMatchIds.has(
                                      match.id,
                                    );
                                    const toggleHiddenLabel = isHidden
                                      ? t("unhideMatch")
                                      : t("hideMatch");
                                    return (
                                      <div
                                        key={match.id}
                                        data-hidden={isHidden || undefined}
                                        className="flex items-center justify-between gap-2 py-1.5 text-sm"
                                      >
                                        <span
                                          className={
                                            isHidden
                                              ? "flex items-center gap-2 text-muted-foreground"
                                              : undefined
                                          }
                                        >
                                          <span
                                            className={
                                              isHidden
                                                ? "line-through"
                                                : undefined
                                            }
                                          >
                                            {match.home_team} –{" "}
                                            {match.away_team}
                                          </span>
                                          {isHidden && (
                                            <Badge
                                              variant="outline"
                                              className="font-normal"
                                            >
                                              {t("hiddenBadge")}
                                            </Badge>
                                          )}
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
                                          {canEdit && (
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="icon"
                                              className="h-7 w-7"
                                              aria-pressed={isHidden}
                                              aria-label={toggleHiddenLabel}
                                              title={toggleHiddenLabel}
                                              data-testid={`toggle-hidden-${match.id}`}
                                              onClick={() =>
                                                handleSetHidden(
                                                  [match.id],
                                                  !isHidden,
                                                )
                                              }
                                            >
                                              {isHidden ? (
                                                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                                              ) : (
                                                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                                              )}
                                            </Button>
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
                                    );
                                  })}
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
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}
      {view === "responses" && (
        <ResponseSummary
          pollId={poll.id}
          slots={filteredSlots}
          responses={liveResponses}
          roster={roster}
          onResponseChange={handleResponseChange}
          onResponseSaved={handleResponseSaved}
        />
      )}
      {view === "assignments" &&
        (hideSilentUmpires &&
        !isFocused &&
        umpires.length > 0 &&
        gridUmpires.length === 0 ? (
          <p
            className="py-4 text-sm text-muted-foreground"
            data-testid="no-responders-in-range"
          >
            {t("noRespondersInRange")}
          </p>
        ) : (
          <AssignmentGrid
            pollId={poll.id}
            matches={filteredMatches}
            slots={filteredSlots}
            responses={liveResponses}
            assignments={liveAssignments}
            umpires={gridUmpires}
            transposed={transposed}
            tentativeMode={tentativeMode}
            clubName={clubName}
            onAssignmentsChange={setLiveAssignments}
            onNoteSaved={refreshPoll}
            onUmpireNoteSaved={refreshUmpires}
            hiddenMatchIds={poll.hiddenMatchIds}
            closedDays={poll.closedDays}
            onSetHidden={canEdit ? handleSetHidden : undefined}
            bulkPending={bulkPending}
            corner={
              <div className="flex items-center gap-1">
                <UmpireFilterMenu
                  umpires={umpires}
                  focusedUmpireIds={focusedUmpires.map((u) => u.id)}
                  onFocusedUmpireIdsChange={setFocusedUmpireIds}
                  hideSilentUmpires={hideSilentUmpires}
                  onHideSilentUmpiresChange={setHideSilentUmpires}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={() => setTransposed((prev) => !prev)}
                  aria-label={t("swapRowsAndColumns")}
                  title={t("swapAxes")}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                </Button>
              </div>
            }
          />
        ))}
    </div>
  );
}
