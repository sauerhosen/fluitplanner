"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SlotRow } from "@/components/poll-response/slot-row";
import { StickyDirtyBar } from "@/components/poll-response/sticky-dirty-bar";
import { submitResponses } from "@/lib/actions/public-polls";
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
import { useTranslations, useFormatter } from "next-intl";
import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";
import type { AvailabilityGuardPolicy } from "@/lib/types/availability";

type ResponseValue = "yes" | "if_need_be" | "no";

type Props = {
  pollId: string;
  umpireId: string;
  umpireName: string;
  slots: PollSlot[];
  existingResponses: AvailabilityResponse[];
  guardPolicy: AvailabilityGuardPolicy;
  assignedSlotIds: string[];
};

export function AvailabilityForm({
  pollId,
  umpireId,
  umpireName,
  slots,
  existingResponses,
  guardPolicy,
  assignedSlotIds,
}: Props) {
  const t = useTranslations("pollResponse");
  const format = useFormatter();

  // Capture "now" once on mount so slots don't shuffle between past/future on re-renders
  const mountTimeRef = useRef(new Date());
  const now = mountTimeRef.current;
  const assignedSlotSet = useMemo(
    () => new Set(assignedSlotIds),
    [assignedSlotIds],
  );

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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showPastDates, setShowPastDates] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [savedBaseline, setSavedBaseline] =
    useState<Record<string, ResponseValue | null>>(initialState);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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
    setResponses((prev) => ({ ...prev, [slotId]: value }));
    setError(null);
    setStatusMessage(null);
  }

  async function runSubmit(confirmAssignedDowngrade = false) {
    setSaving(true);
    setError(null);
    setStatusMessage(null);

    const toSubmit = Array.from(futureSlotIds).map((slotId) => ({
      slotId,
      response: responses[slotId],
    }));

    try {
      const result = await submitResponses(
        pollId,
        umpireId,
        umpireName,
        toSubmit,
        { confirmAssignedDowngrade },
      );

      if (result.status === "confirm_required") {
        setConfirmOpen(true);
        return;
      }

      if (result.status === "partial_saved") {
        const blockedSet = new Set(result.blockedSlots);
        const nextBaseline: Record<string, ResponseValue | null> = {
          ...savedBaseline,
        };
        const nextResponses: Record<string, ResponseValue | null> = {
          ...responses,
        };

        for (const slotId of futureSlotIds) {
          if (blockedSet.has(slotId)) {
            nextResponses[slotId] = savedBaseline[slotId];
            continue;
          }
          nextBaseline[slotId] = responses[slotId];
        }

        setResponses(nextResponses);
        setSavedBaseline(nextBaseline);
        setStatusMessage(
          t("guardBlockedPartialSaved", { count: result.blockedSlots.length }),
        );
      } else {
        setSavedBaseline({ ...responses });
      }

      setShowSavedInBar(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setShowSavedInBar(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToSave"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    await runSubmit(false);
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
            const isAssigned = assignedSlotSet.has(slot.id);
            const value = responses[slot.id];
            const downgradeBlocked =
              guardPolicy === "block" &&
              isAssigned &&
              (value === "yes" || value === "if_need_be");

            return (
              <SlotRow
                key={slot.id}
                startTime={slot.start_time}
                endTime={slot.end_time}
                value={value}
                onChange={(nextValue) => handleChange(slot.id, nextValue)}
                disabled={disabled}
                disabledValues={downgradeBlocked ? ["no"] : []}
                disableClear={downgradeBlocked}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
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

        {statusMessage && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {statusMessage}
          </p>
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
              disabled={!isDirty || saving}
              onSave={() => handleSubmit()}
            />
          </>
        )}
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("guardConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("guardConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("guardConfirmCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async (event) => {
                event.preventDefault();
                setConfirmOpen(false);
                await runSubmit(true);
              }}
            >
              {t("guardConfirmProceed")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
