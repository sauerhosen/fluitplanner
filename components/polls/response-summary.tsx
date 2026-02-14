"use client";

import { useState } from "react";
import { Check, X, HelpCircle } from "lucide-react";
import { toast } from "sonner";
import { updatePollResponse } from "@/lib/actions/poll-responses";
import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";
import { useTranslations, useFormatter } from "next-intl";

type ResponseValue = "yes" | "if_need_be" | "no";

const CYCLE_ORDER: (ResponseValue | null)[] = ["yes", "if_need_be", "no", null];

/**
 * Advance a response value to the next state in the cycle: "yes" -> "if_need_be" -> "no" -> no response.
 *
 * @param current - The current response value, or `null` to indicate no response.
 * @returns The next `ResponseValue` in the sequence, or `null` when the cycle advances to no response.
 */
function nextResponse(current: ResponseValue | null): ResponseValue | null {
  const idx = CYCLE_ORDER.indexOf(current);
  return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length];
}

type DateGroup = {
  weekday: string;
  day: string;
  slots: PollSlot[];
};

/**
 * Create a stable composite key for a slot-umpire pair.
 *
 * @param slotId - The slot's identifier
 * @param umpireId - The umpire's identifier
 * @returns A string in the format `slotId:umpireId` representing the composite key
 */
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

/**
 * Render an interactive table of umpire availability where each cell shows and cycles a participant's response for a slot.
 *
 * Renders participants as rows and grouped slots as columns. Cells display the current response (yes, if_need_be, no, or no response)
 * and act as buttons that optimistically update the UI and persist changes via `updatePollResponse`, reverting and showing a toast on failure.
 *
 * @param pollId - Identifier of the poll used when persisting response updates
 * @param slots - Array of poll slots to display (grouped by calendar date in the header)
 * @param responses - Initial availability responses used to seed the per-slot-per-participant state
 * @returns A React element containing the availability table with clickable cells for cycling responses
 */
export function ResponseSummary({ pollId, slots, responses }: Props) {
  const t = useTranslations("polls");
  const format = useFormatter();

  function groupSlotsByDate(slotsToGroup: PollSlot[]): DateGroup[] {
    const groups: DateGroup[] = [];
    for (const slot of slotsToGroup) {
      const date = new Date(slot.start_time);
      const dateKey = date.toDateString();
      const last = groups[groups.length - 1];
      if (
        last &&
        new Date(last.slots[0].start_time).toDateString() === dateKey
      ) {
        last.slots.push(slot);
      } else {
        groups.push({
          weekday: format.dateTime(date, { weekday: "short" }),
          day: format.dateTime(date, {
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
    return format.dateTime(new Date(isoString), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  const RESPONSE_ICONS: Record<
    ResponseValue,
    { icon: typeof Check; className: string; label: string }
  > = {
    yes: {
      icon: Check,
      className: "text-green-600 dark:text-green-400",
      label: t("availableLabel"),
    },
    if_need_be: {
      icon: HelpCircle,
      className: "text-yellow-500 dark:text-yellow-400",
      label: t("ifNeedBeLabel"),
    },
    no: {
      icon: X,
      className: "text-red-500 dark:text-red-400",
      label: t("notAvailableLabel"),
    },
  };

  const [responseMap, setResponseMap] = useState(() => {
    const map = new Map<string, ResponseValue>();
    for (const r of responses) {
      if (r.umpire_id) {
        map.set(cellKey(r.slot_id, r.umpire_id), r.response);
      }
    }
    return map;
  });

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
        {t("noResponsesYet")}
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

    const revert = () => {
      setResponseMap((prev) => {
        const reverted = new Map(prev);
        if (current === null) {
          reverted.delete(key);
        } else {
          reverted.set(key, current);
        }
        return reverted;
      });
    };

    updatePollResponse(pollId, slotId, umpireId, next)
      .then((result) => {
        if (result.error) {
          revert();
          toast.error(t("failedToUpdateResponse", { error: result.error }));
        }
      })
      .catch(() => {
        revert();
        toast.error(t("failedToUpdateResponseGeneric"));
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
                  const label = `${name} – ${formatTime(slot.start_time)}: ${config?.label ?? t("noResponseLabel")}`;
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
