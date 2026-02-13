"use client";

import { Button } from "@/components/ui/button";

type ResponseValue = "yes" | "if_need_be" | "no";

type Props = {
  startTime: string;
  endTime: string;
  value: ResponseValue | null;
  onChange: (value: ResponseValue) => void;
};

function formatSlotTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatSlotDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

const BUTTONS: {
  value: ResponseValue;
  label: string;
  activeClass: string;
}[] = [
  {
    value: "yes",
    label: "Yes",
    activeClass: "bg-green-600 text-white hover:bg-green-700 border-green-600",
  },
  {
    value: "if_need_be",
    label: "If need be",
    activeClass:
      "bg-yellow-500 text-white hover:bg-yellow-600 border-yellow-500",
  },
  {
    value: "no",
    label: "No",
    activeClass: "bg-red-600 text-white hover:bg-red-700 border-red-600",
  },
];

export function SlotRow({ startTime, endTime, value, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="text-sm font-medium">
        {formatSlotDate(startTime)}, {formatSlotTime(startTime)} &ndash;{" "}
        {formatSlotTime(endTime)}
      </div>
      <div className="flex gap-2">
        {BUTTONS.map((btn) => (
          <Button
            key={btn.value}
            type="button"
            variant={value === btn.value ? "default" : "outline"}
            size="sm"
            className={value === btn.value ? btn.activeClass : ""}
            onClick={() => onChange(btn.value)}
          >
            {btn.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
