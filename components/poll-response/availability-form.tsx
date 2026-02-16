"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { SlotRow } from "@/components/poll-response/slot-row";
import { StickyDirtyBar } from "@/components/poll-response/sticky-dirty-bar";
import { submitResponses } from "@/lib/actions/public-polls";
import { useTranslations, useFormatter } from "next-intl";
import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";

type ResponseValue = "yes" | "if_need_be" | "no";

type Props = {
  pollId: string;
  umpireId: string;
  umpireName: string;
  slots: PollSlot[];
  existingResponses: AvailabilityResponse[];
};

export function AvailabilityForm({
  pollId,
  umpireId,
  umpireName,
  slots,
  existingResponses,
}: Props) {
  const t = useTranslations("pollResponse");
  const format = useFormatter();

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

  const [savedBaseline, setSavedBaseline] =
    useState<Record<string, ResponseValue | null>>(initialState);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isDirty = useMemo(() => {
    return Object.keys(responses).some(
      (key) => responses[key] !== savedBaseline[key],
    );
  }, [responses, savedBaseline]);

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
  }

  const hasSelections = Object.values(responses).some((v) => v !== null);

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setSaving(true);
    setError(null);
    const toSubmit = Object.entries(responses)
      .filter(([, value]) => value !== null)
      .map(([slotId, response]) => ({ slotId, response: response! }));
    try {
      await submitResponses(pollId, umpireId, umpireName, toSubmit);
      setSavedBaseline({ ...responses });
      setShowSavedInBar(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setShowSavedInBar(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToSave"));
    } finally {
      setSaving(false);
    }
  }

  const dateGroups = groupSlotsByDate(slots);
  const barVisible = isDirty || saving || showSavedInBar || error !== null;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {dateGroups.map((group) => (
        <div key={group.dateKey}>
          <div className="bg-muted text-muted-foreground mb-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
            {group.label}
          </div>
          <div className="px-3">
            {group.slots.map((slot) => (
              <SlotRow
                key={slot.id}
                startTime={slot.start_time}
                endTime={slot.end_time}
                value={responses[slot.id]}
                onChange={(value) => handleChange(slot.id, value)}
              />
            ))}
          </div>
        </div>
      ))}
      <div className="h-16" />
      <StickyDirtyBar
        visible={barVisible}
        saving={saving}
        saved={showSavedInBar && !isDirty}
        error={error}
        disabled={!hasSelections || saving}
        onSave={() => handleSubmit()}
      />
    </form>
  );
}
