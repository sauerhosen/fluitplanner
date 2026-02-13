"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SlotRow } from "@/components/poll-response/slot-row";
import { submitResponses } from "@/lib/actions/public-polls";
import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";

type ResponseValue = "yes" | "if_need_be" | "no";

type Props = {
  pollId: string;
  umpireId: string;
  umpireName: string;
  slots: PollSlot[];
  existingResponses: AvailabilityResponse[];
};

function formatDateHeading(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function groupSlotsByDate(slots: PollSlot[]) {
  const groups: { dateKey: string; label: string; slots: PollSlot[] }[] = [];
  for (const slot of slots) {
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

export function AvailabilityForm({
  pollId,
  umpireId,
  umpireName,
  slots,
  existingResponses,
}: Props) {
  const initialState: Record<string, ResponseValue | null> = {};
  for (const slot of slots) {
    const existing = existingResponses.find((r) => r.slot_id === slot.id);
    initialState[slot.id] = existing ? existing.response : null;
  }

  const [responses, setResponses] =
    useState<Record<string, ResponseValue | null>>(initialState);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleChange(slotId: string, value: ResponseValue | null) {
    setResponses((prev) => ({ ...prev, [slotId]: value }));
    setSaved(false);
  }

  const hasSelections = Object.values(responses).some((v) => v !== null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const toSubmit = Object.entries(responses)
      .filter(([, value]) => value !== null)
      .map(([slotId, response]) => ({ slotId, response: response! }));
    try {
      await submitResponses(pollId, umpireId, umpireName, toSubmit);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to save. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const dateGroups = groupSlotsByDate(slots);

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
      {error && <p className="text-sm text-red-600">{error}</p>}
      {saved && (
        <p className="text-sm text-green-600">
          Your availability has been saved!
        </p>
      )}
      <Button
        type="submit"
        disabled={!hasSelections || saving}
        className="w-full"
      >
        {saving ? "Saving\u2026" : saved ? "Save changes" : "Save availability"}
      </Button>
    </form>
  );
}
