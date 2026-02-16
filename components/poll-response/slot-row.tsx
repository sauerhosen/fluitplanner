"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations, useFormatter } from "next-intl";

type ResponseValue = "yes" | "if_need_be" | "no";

type Props = {
  startTime: string;
  endTime: string;
  value: ResponseValue | null;
  onChange: (value: ResponseValue | null) => void;
  disabled?: boolean;
};

type ButtonConfig = {
  value: ResponseValue;
  labelKey: "yes" | "ifNeedBe" | "no";
  activeClass: string;
};

const BUTTONS: ButtonConfig[] = [
  {
    value: "yes",
    labelKey: "yes",
    activeClass: "bg-green-600 text-white hover:bg-green-700 border-green-600",
  },
  {
    value: "if_need_be",
    labelKey: "ifNeedBe",
    activeClass:
      "bg-yellow-500 text-white hover:bg-yellow-600 border-yellow-500",
  },
  {
    value: "no",
    labelKey: "no",
    activeClass: "bg-red-600 text-white hover:bg-red-700 border-red-600",
  },
];

export function SlotRow({
  startTime,
  endTime,
  value,
  onChange,
  disabled,
}: Props) {
  const t = useTranslations("pollResponse");
  const format = useFormatter();

  function formatTime(isoString: string): string {
    return format.dateTime(new Date(isoString), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between border-b py-3 last:border-b-0",
        disabled && "opacity-60",
      )}
    >
      <div className="text-sm">
        {formatTime(startTime)} &ndash; {formatTime(endTime)}
      </div>
      <div className="flex gap-1.5">
        {BUTTONS.map((btn) => (
          <Button
            key={btn.value}
            type="button"
            variant={value === btn.value ? "default" : "outline"}
            size="sm"
            className={value === btn.value ? btn.activeClass : ""}
            onClick={() => onChange(value === btn.value ? null : btn.value)}
            disabled={disabled}
          >
            {t(btn.labelKey)}
          </Button>
        ))}
      </div>
    </div>
  );
}
