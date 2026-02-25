"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SlotRow } from "@/components/poll-response/slot-row";
import { StickyDirtyBar } from "@/components/poll-response/sticky-dirty-bar";
import { AssignmentWarningDialog } from "@/components/poll-response/assignment-warning-dialog";
import { submitResponses } from "@/lib/actions/public-polls";
import { useTranslations, useFormatter } from "next-intl";
import type {
  PollSlot,
  AvailabilityResponse,
  PollAssignmentContext,
} from "@/lib/types/domain";

type ResponseValue = "yes" | "if_need_be" | "no";

type Props = {
  pollId: string;
  umpireId: string;
  umpireName: string;
  slots: PollSlot[];
  existingResponses: AvailabilityResponse[];
  assignmentContext?: PollAssignmentContext | null;
};

export function AvailabilityForm({
  pollId,
  umpireId,
  umpireName,
  slots,
  existingResponses,
  assignmentContext,
}: Props) {
  const t = useTranslations("pollResponse");
  const format = useFormatter();

  // Capture "now" once on mount so slots don't shuffle between past/future on re-renders
  const mountTimeRef = useRef(new Date());
  const now = mountTimeRef.current;

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

  // Partition slots into future (editable) and past (read-only)
  const futureSlots = useMemo(
    () => slots.filter((s) => new Date(s.start_time) >= now),
    [slots, now],
  );
  const pastSlots = useMemo(
    () => slots.filter((s) => new Date(s.start_time) < now),
    [slots, now],
  );
  const futureSlotIds = useMemo(
    () => new Set(futureSlots.map((s) => s.id)),
    [futureSlots],
  );

  const futureDateGroups = groupSlotsByDate(futureSlots);
  const pastDateGroups = groupSlotsByDate(pastSlots);

  const allSlotsInPast = futureSlots.length === 0 && pastSlots.length > 0;
  const hasPastSlots = pastSlots.length > 0;

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
  const [showPastDates, setShowPastDates] = useState(false);
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

  // Only track dirty state for future (editable) slots
  const isDirty = useMemo(() => {
    return Array.from(futureSlotIds).some(
      (key) => responses[key] !== savedBaseline[key],
    );
  }, [responses, savedBaseline, futureSlotIds]);

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

  // Only consider future slots for save button enable state
  const hasSelections = Array.from(futureSlotIds).some(
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
    // Only submit responses for future slots
    const toSubmit = Object.entries(responses)
      .filter(([slotId, value]) => value !== null && futureSlotIds.has(slotId))
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
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Edge case: all slots in past */}
      {allSlotsInPast && (
        <div className="bg-muted text-muted-foreground rounded-md px-3 py-4 text-center text-sm">
          {t("allDatesInPast")}
        </div>
      )}

      {/* Future date groups (editable) */}
      {futureDateGroups.map((group) => renderDateGroup(group))}

      {/* When all slots are past, show them expanded (no toggle) */}
      {allSlotsInPast && (
        <div className="space-y-4">
          {pastDateGroups.map((group) => renderDateGroup(group, true))}
        </div>
      )}

      {/* Past dates toggle + collapsible section (only when there are also future slots) */}
      {hasPastSlots && !allSlotsInPast && (
        <div>
          <button
            type="button"
            onClick={() => setShowPastDates((prev) => !prev)}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-3 py-2 text-sm"
          >
            {showPastDates ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {t("pastDatesToggle", { count: pastDateGroups.length })}
          </button>

          {showPastDates && (
            <div className="space-y-4">
              {pastDateGroups.map((group) => renderDateGroup(group, true))}
            </div>
          )}
        </div>
      )}

      {/* Save bar — only when there are future slots to save */}
      {!allSlotsInPast && (
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
