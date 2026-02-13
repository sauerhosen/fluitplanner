import type { PollSlot, AvailabilityResponse } from "@/lib/types/domain";

const RESPONSE_COLORS: Record<string, string> = {
  yes: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  if_need_be:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  no: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

const RESPONSE_LABELS: Record<string, string> = {
  yes: "Yes",
  if_need_be: "If need be",
  no: "No",
};

function formatSlotHeader(slot: PollSlot): string {
  const start = new Date(slot.start_time);
  const date = start.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = start.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = new Date(slot.end_time).toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} ${time}\u2013${endTime}`;
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left p-2 border-b font-medium sticky left-0 bg-background">
              Umpire
            </th>
            {slots.map((slot) => (
              <th
                key={slot.id}
                className="text-center p-2 border-b font-medium min-w-[100px]"
              >
                {formatSlotHeader(slot)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {participants.map((name) => (
            <tr key={name}>
              <td className="p-2 border-b font-medium sticky left-0 bg-background">
                {name}
              </td>
              {slots.map((slot) => {
                const response = responseMap.get(slot.id)?.get(name);
                return (
                  <td key={slot.id} className="p-2 border-b text-center">
                    {response ? (
                      <span
                        className={`inline-block rounded px-2 py-1 text-xs font-medium ${RESPONSE_COLORS[response]}`}
                      >
                        {RESPONSE_LABELS[response]}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{"\u2014"}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
