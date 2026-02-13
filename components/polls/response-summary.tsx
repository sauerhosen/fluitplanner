import { Check, X, HelpCircle } from "lucide-react";
import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";

const RESPONSE_ICONS: Record<
  string,
  { icon: typeof Check; className: string }
> = {
  yes: { icon: Check, className: "text-green-600 dark:text-green-400" },
  if_need_be: {
    icon: HelpCircle,
    className: "text-yellow-500 dark:text-yellow-400",
  },
  no: { icon: X, className: "text-red-500 dark:text-red-400" },
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

type Props = {
  slots: PollSlot[];
  responses: AvailabilityResponse[];
};

export function ResponseSummary({ slots, responses }: Props) {
  const participants = [
    ...new Set(responses.map((r) => r.participant_name)),
  ].sort();

  if (participants.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No responses yet. Share the poll link with umpires to collect
        availability.
      </p>
    );
  }

  const responseMap = new Map<string, Map<string, string>>();
  for (const r of responses) {
    if (!responseMap.has(r.slot_id)) responseMap.set(r.slot_id, new Map());
    responseMap.get(r.slot_id)!.set(r.participant_name, r.response);
  }

  const dateGroups = groupSlotsByDate(slots);

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
          {participants.map((name) => (
            <tr key={name}>
              <td className="p-2 border-b font-medium sticky left-0 z-10 bg-background whitespace-nowrap">
                {name}
              </td>
              {dateGroups.flatMap((group, gi) =>
                group.slots.map((slot, si) => {
                  const response = responseMap.get(slot.id)?.get(name);
                  const config = response ? RESPONSE_ICONS[response] : null;
                  return (
                    <td
                      key={slot.id}
                      className={`border-b text-center ${gi > 0 && si === 0 ? "border-l-2 border-border" : ""}`}
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
