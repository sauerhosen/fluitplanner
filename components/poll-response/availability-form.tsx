"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SlotRow } from "@/components/poll-response/slot-row";
import { StickyDirtyBar } from "@/components/poll-response/sticky-dirty-bar";
import { AssignmentWarningDialog } from "@/components/poll-response/assignment-warning-dialog";
import { submitResponses } from "@/lib/actions/public-polls";
import { useTranslations, useFormatter } from "next-intl";
import { groupFeaturedBySlot } from "@/lib/domain/featured-matches";
import type {
  PollSlot,
  AvailabilityResponse,
  PollAssignmentContext,
  FeaturedMatch,
} from "@/lib/types/domain";

type ResponseValue = "yes" | "if_need_be" | "no";

type Props = {
  pollId: string;
  umpireId: string;
  umpireName: string;
  slots: PollSlot[];
  existingResponses: AvailabilityResponse[];
  assignmentContext?: PollAssignmentContext | null;
  featuredMatches?: FeaturedMatch[];
  /** Slots on days the planner closed: shown in place, but read-only. */
  closedSlotIds?: string[];
};

const NO_CLOSED_SLOTS: string[] = [];

export function AvailabilityForm({
  pollId,
  umpireId,
  umpireName,
  slots,
  existingResponses,
  assignmentContext,
  featuredMatches,
  closedSlotIds = NO_CLOSED_SLOTS,
}: Props) {
  const t = useTranslations("pollResponse");
  const format = useFormatter();

  // Capture "now" once on mount so slots don't shuffle between past/future on re-renders
  const [now] = useState(() => new Date());

  function formatDateHeading(isoString: string): string {
    return format.dateTime(new Date(isoString), {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  function groupSlotsByDate(slotsToGroup: PollSlot[]) {
    const groups: { dateKey: string; label: string; slots: PollSlot[] }[] = [];
    for (const slot of slotsToGroup) {
      const date = new Date(slot.start_time);
      const dateKey = date.toDateString();
      const last = groups[groups.length - 1];
      if (last && last.dateKey === dateKey) {
        last.slots.push(slot);
      } else {
        groups.push({
          dateKey,
          label: formatDateHeading(slot.start_time),
          slots: [slot],
        });
      }
    }
    return groups;
  }

  // Partition slots into open (editable) and closed (read-only). A slot is
  // closed once it has passed or the planner closed its day.
  const closedSet = useMemo(() => new Set(closedSlotIds), [closedSlotIds]);
  const [openSlots, closedSlots] = useMemo(() => {
    const open: PollSlot[] = [];
    const closed: PollSlot[] = [];
    for (const s of slots) {
      const isClosed = new Date(s.start_time) < now || closedSet.has(s.id);
      (isClosed ? closed : open).push(s);
    }
    return [open, closed];
  }, [slots, now, closedSet]);
  const editableSlotIds = useMemo(
    () => new Set(openSlots.map((s) => s.id)),
    [openSlots],
  );

  const openDateGroups = groupSlotsByDate(openSlots);
  const closedDateGroups = groupSlotsByDate(closedSlots);

  const noOpenSlots = openSlots.length === 0 && closedSlots.length > 0;
  const allSlotsInPast =
    noOpenSlots && slots.every((s) => new Date(s.start_time) < now);
  const hasClosedSlots = closedSlots.length > 0;

  const initialState: Record<string, ResponseValue | null> = {};
  for (const slot of slots) {
    const existing = existingResponses.find((r) => r.slot_id === slot.id);
    initialState[slot.id] = existing ? existing.response : null;
  }

  const [responses, setResponses] =
    useState<Record<string, ResponseValue | null>>(initialState);
  const [saving, setSaving] = useState(false);
  const [showSavedInBar, setShowSavedInBar] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showClosedDates, setShowClosedDates] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);

  const [savedBaseline, setSavedBaseline] =
    useState<Record<string, ResponseValue | null>>(initialState);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Assignment context derived state
  const lockMode = assignmentContext?.lockMode ?? "warn";
  const assignedSlotMap = useMemo(() => {
    const map = new Map<
      string,
      { matchId: string; homeTeam: string; awayTeam: string }[]
    >();
    if (!assignmentContext) return map;
    for (const slot of assignmentContext.assignedSlots) {
      map.set(slot.slotId, slot.matches);
    }
    return map;
  }, [assignmentContext]);

  const featuredBySlot = useMemo(
    () => groupFeaturedBySlot(featuredMatches ?? []),
    [featuredMatches],
  );

  // Track which assigned slots are being downgraded (for warnings)
  const pendingOverrideSlots = useMemo(() => {
    const overrides = new Set<string>();
    for (const slotId of assignedSlotMap.keys()) {
      const saved = savedBaseline[slotId];
      const current = responses[slotId];
      const wasAvailable = saved === "yes" || saved === "if_need_be";
      const isNowNo = current === "no";
      if (wasAvailable && isNowNo) {
        overrides.add(slotId);
      }
    }
    return overrides;
  }, [responses, savedBaseline, assignedSlotMap]);

  // Collect all matches affected by pending overrides (for dialog)
  const affectedMatches = useMemo(() => {
    const matches: { homeTeam: string; awayTeam: string }[] = [];
    for (const slotId of pendingOverrideSlots) {
      const slotMatches = assignedSlotMap.get(slotId);
      if (slotMatches) {
        matches.push(...slotMatches);
      }
    }
    return matches;
  }, [pendingOverrideSlots, assignedSlotMap]);

  // Only track dirty state for editable slots
  const isDirty = useMemo(() => {
    return Array.from(editableSlotIds).some(
      (key) => responses[key] !== savedBaseline[key],
    );
  }, [responses, savedBaseline, editableSlotIds]);

  // Warn on page leave with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Clean up saved timer on unmount
  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  function handleChange(slotId: string, value: ResponseValue | null) {
    // In lock mode, prevent any changes to assigned slots
    if (lockMode === "lock" && assignedSlotMap.has(slotId)) {
      return;
    }
    setResponses((prev) => ({ ...prev, [slotId]: value }));
    setError(null);
  }

  // Only consider editable slots for save button enable state
  const hasSelections = Array.from(editableSlotIds).some(
    (id) => responses[id] !== null,
  );

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();

    // In warn mode, show confirmation dialog if there are pending overrides
    if (
      lockMode === "warn" &&
      pendingOverrideSlots.size > 0 &&
      !showOverrideDialog
    ) {
      setShowOverrideDialog(true);
      return;
    }

    setSaving(true);
    setError(null);
    setShowOverrideDialog(false);
    // Only submit responses for editable slots
    const toSubmit = Object.entries(responses)
      .filter(
        ([slotId, value]) => value !== null && editableSlotIds.has(slotId),
      )
      .map(([slotId, response]) => ({ slotId, response: response! }));
    try {
      const result = await submitResponses(
        pollId,
        umpireId,
        umpireName,
        toSubmit,
      );
      if (result.status === "partial_saved") {
        // Some slots were blocked by lock mode — update baseline for saved slots only
        const blockedIds = new Set(result.blockedSlots.map((b) => b.slotId));
        const newBaseline = { ...responses };
        // Revert blocked slots to their saved baseline values
        for (const slotId of blockedIds) {
          newBaseline[slotId] = savedBaseline[slotId];
        }
        setResponses(newBaseline);
        setSavedBaseline(newBaseline);
        const labels = result.blockedSlots.flatMap((b) => b.matchLabels);
        setError(t("partialSaveBlocked", { matches: labels.join(", ") }));
      } else {
        setSavedBaseline({ ...responses });
        setShowSavedInBar(true);
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(
          () => setShowSavedInBar(false),
          2000,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToSave"));
    } finally {
      setSaving(false);
    }
  }

  function handleOverrideConfirm() {
    handleSubmit();
  }

  const barVisible = isDirty || saving || showSavedInBar || error !== null;

  // Renders a date group's slots
  function renderDateGroup(
    group: { dateKey: string; label: string; slots: PollSlot[] },
    disabled?: boolean,
  ) {
    return (
      <div key={group.dateKey}>
        <div className="bg-muted text-muted-foreground mb-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
          {group.label}
        </div>
        <div className="px-3">
          {group.slots.map((slot) => {
            const isAssigned = assignedSlotMap.has(slot.id);
            const isLocked = lockMode === "lock" && isAssigned;
            const isOverriding =
              lockMode === "warn" && pendingOverrideSlots.has(slot.id);
            const slotMatches = assignedSlotMap.get(slot.id);
            const matchLabels = slotMatches?.map(
              (m) => `${m.homeTeam} vs ${m.awayTeam}`,
            );
            // Withheld in the read-only closed section, and on slots this
            // umpire already has — there is nobody left to entice.
            const featured =
              disabled || isAssigned ? undefined : featuredBySlot.get(slot.id);

            return (
              <SlotRow
                key={slot.id}
                startTime={slot.start_time}
                endTime={slot.end_time}
                value={responses[slot.id]}
                onChange={(value) => handleChange(slot.id, value)}
                disabled={disabled}
                locked={isLocked}
                showWarning={isOverriding}
                assignedMatchLabels={matchLabels}
                featuredMatches={featured}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Edge case: nothing left to answer (passed, or closed by the planner) */}
      {noOpenSlots && (
        <div className="bg-muted text-muted-foreground rounded-md px-3 py-4 text-center text-sm">
          {allSlotsInPast ? t("allDatesInPast") : t("allDaysClosedDescription")}
        </div>
      )}

      {/* Open date groups (editable) */}
      {openDateGroups.map((group) => renderDateGroup(group))}

      {/* When nothing is open, show the closed dates expanded (no toggle) */}
      {noOpenSlots && (
        <div className="space-y-4">
          {closedDateGroups.map((group) => renderDateGroup(group, true))}
        </div>
      )}

      {/* Closed dates toggle + collapsible section (past and planner-closed) */}
      {hasClosedSlots && !noOpenSlots && (
        <div>
          <button
            type="button"
            onClick={() => setShowClosedDates((prev) => !prev)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-2 text-sm"
          >
            {showClosedDates ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {t("closedDatesToggle", { count: closedDateGroups.length })}
          </button>

          {showClosedDates && (
            <div className="space-y-4">
              {closedDateGroups.map((group) => renderDateGroup(group, true))}
            </div>
          )}
        </div>
      )}

      {/* Save bar — only when there are open slots to save */}
      {editableSlotIds.size > 0 && (
        <>
          <div className="h-16" />
          <StickyDirtyBar
            visible={barVisible}
            saving={saving}
            saved={showSavedInBar && !isDirty}
            error={error}
            disabled={!hasSelections || saving}
            onSave={() => handleSubmit()}
          />
        </>
      )}

      {/* Override warning dialog (warn mode only) */}
      <AssignmentWarningDialog
        open={showOverrideDialog}
        onOpenChange={setShowOverrideDialog}
        affectedMatches={affectedMatches}
        onConfirm={handleOverrideConfirm}
      />
    </form>
  );
}
