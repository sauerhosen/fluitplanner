"use client";

import type { TimeSlot } from "@/lib/types/domain";
import { Card } from "@/components/ui/card";
import { useTranslations, useFormatter } from "next-intl";

export function SlotPreview({ slots }: { slots: TimeSlot[] }) {
  const t = useTranslations("polls");
  const format = useFormatter();

  function formatSlotTime(date: Date): string {
    return format.dateTime(date, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function formatSlotDate(date: Date): string {
    return format.dateTime(date, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("selectMatchesToSeeSlots")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">
        {t("slotCount", { count: slots.length })}
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
