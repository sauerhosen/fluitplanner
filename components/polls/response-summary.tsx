"use client";

import { useState, useTransition } from "react";
import { Check, X, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { updatePollResponse } from "@/lib/actions/poll-responses";
import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";

type ResponseValue = "yes" | "if_need_be" | "no";

const CYCLE_ORDER: (ResponseValue | null)[] = ["yes", "if_need_be", "no", null];

function nextResponse(current: ResponseValue | null): ResponseValue | null {
  const idx = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
}

const RESPONSE_ICONS: Record<
  ResponseValue,
  { icon: typeof Check; className: string; label: string }
> = {
  yes: {
    icon: Check,
    className: "text-green-600 dark:text-green-400",
    label: "available",
  },
  if_need_be: {
    icon: HelpCircle,
    className: "text-yellow-500 dark:text-yellow-400",
    label: "if need be",
  },
  no: {
    icon: X,
    className: "text-red-500 dark:text-red-400",
    label: "not available",
  },
};

type DateGroup = {
  weekday: string;
  day: string;
  slots: PollSlot[];
};

function groupSlotsByDate(slots: PollSlot[]): DateGroup[] {
  const groups: DateGroup[] = [];
  for (const slot of slots) {
    const date = new Date(slot.start_time);
    const dateKey = date.toDateString();
    const last = groups[groups.length - 1];
    if (last && new Date(last.slots[0].start_time).toDateString() === dateKey) {
      last.slots.push(slot);
    } else {
      groups.push({
        weekday: date.toLocaleDateString("nl-NL", { weekday: "short" }),
        day: date.toLocaleDateString("nl-NL", {
          day: "numeric",
          month: "short",
        }),
        slots: [slot],
      });
    }
  }
  return groups;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function cellKey(slotId: string, umpireId: string) {
  return `${slotId}:${umpireId}`;
}

type Participant = {
  umpireId: string;
  name: string;
};

type Props = {
  pollId: string;
  slots: PollSlot[];
  responses: AvailabilityResponse[];
};

export function ResponseSummary({ pollId, slots, responses }: Props) {
  const [isPending, startTransition] = useTransition();

  // Build initial response map from props
  const initialMap = new Map<string, ResponseValue>();
  for (const r of responses) {
    if (r.umpire_id) {
      initialMap.set(cellKey(r.slot_id, r.umpire_id), r.response);
    }
  }
  const [responseMap, setResponseMap] = useState(initialMap);

  // Extract unique participants (umpires with at least one response)
  const participants: Participant[] = [];
  const seen = new Set<string>();
  for (const r of responses) {
    if (r.umpire_id && !seen.has(r.umpire_id)) {
      seen.add(r.umpire_id);
      participants.push({ umpireId: r.umpire_id, name: r.participant_name });
    }
  }
  participants.sort((a, b) => a.name.localeCompare(b.name));

  if (participants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No responses yet. Share the poll link with umpires to collect
        availability.
      </p>
    );
  }

  const dateGroups = groupSlotsByDate(slots);

  function handleClick(slotId: string, umpireId: string) {
    const key = cellKey(slotId, umpireId);
    const current = responseMap.get(key) ?? null;
    const next = nextResponse(current);

    // Optimistic update
    setResponseMap((prev) => {
      const updated = new Map(prev);
      if (next === null) {
        updated.delete(key);
      } else {
        updated.set(key, next);
      }
      return updated;
    });

    startTransition(async () => {
      const result = await updatePollResponse(pollId, slotId, umpireId, next);
      if (result.error) {
        // Revert on error
        setResponseMap((prev) => {
          const reverted = new Map(prev);
          if (current === null) {
            reverted.delete(key);
          } else {
            reverted.set(key, current);
          }
          return reverted;
        });
        toast.error(`Failed to update response: ${result.error}`);
      }
    });
  }

  return (
    <div className="scrollbar-visible overflow-x-auto pb-2">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          {/* Date header row */}
          <tr>
            <th
              rowSpan={2}
              className="text-left p-2 font-medium sticky left-0 z-10 bg-background align-bottom"
            />
            {dateGroups.map((group, i) => (
              <th
                key={i}
                colSpan={group.slots.length}
                className={`text-center px-1 pt-3 pb-1 align-bottom whitespace-nowrap ${i > 0 ? "border-l-2 border-border" : ""}`}
              >
                <div className="text-muted-foreground text-[10px] uppercase tracking-wider">
                  {group.weekday}
                </div>
                <div className="text-base font-bold leading-tight">
                  {group.day}
                </div>
              </th>
            ))}
          </tr>
          {/* Time header row */}
          <tr>
            {dateGroups.flatMap((group, gi) =>
              group.slots.map((slot, si) => (
                <th
                  key={slot.id}
                  className={`text-center px-1 pt-1 pb-2 border-b font-normal whitespace-nowrap text-[11px] text-muted-foreground min-w-16 ${gi > 0 && si === 0 ? "border-l-2 border-border" : ""}`}
                >
                  {formatTime(slot.start_time)}
                  <br />
                  {formatTime(slot.end_time)}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {participants.map(({ umpireId, name }) => (
            <tr key={umpireId}>
              <td className="p-2 border-b font-medium sticky left-0 z-10 bg-background whitespace-nowrap">
                {name}
              </td>
              {dateGroups.flatMap((group, gi) =>
                group.slots.map((slot, si) => {
                  const key = cellKey(slot.id, umpireId);
                  const response = responseMap.get(key) ?? null;
                  const config = response ? RESPONSE_ICONS[response] : null;
                  const label = `${name} – ${formatTime(slot.start_time)}: ${config?.label ?? "no response"}`;
                  return (
                    <td
                      key={slot.id}
                      className={`border-b text-center p-0 ${gi > 0 && si === 0 ? "border-l-2 border-border" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => handleClick(slot.id, umpireId)}
                        className="w-full h-full p-1 cursor-pointer hover:bg-muted/50 transition-colors rounded-sm"
                        aria-label={label}
                        disabled={isPending}
                      >
                        {config ? (
                          <config.icon
                            className={`mx-auto h-5 w-5 ${config.className}`}
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {"\u2014"}
                          </span>
                        )}
                      </button>
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
