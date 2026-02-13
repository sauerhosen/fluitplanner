import type { TimeSlot } from "@/lib/types/domain";
import { Card } from "@/components/ui/card";

function formatSlotTime(date: Date): string {
  return date.toLocaleTimeString("nl-NL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSlotDate(date: Date): string {
  return date.toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function SlotPreview({ slots }: { slots: TimeSlot[] }) {
  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Select matches to see time slots
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">
        {slots.length} time slot{slots.length !== 1 ? "s" : ""}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((slot, i) => (
          <Card key={i} className="px-3 py-2 text-sm">
            <span className="font-medium">{formatSlotDate(slot.start)}</span>{" "}
            {formatSlotTime(slot.start)} – {formatSlotTime(slot.end)}
          </Card>
        ))}
      </div>
    </div>
  );
}
