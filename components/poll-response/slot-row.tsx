"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Lock, AlertTriangle } from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";

type ResponseValue = "yes" | "if_need_be" | "no";

type Props = {
  startTime: string;
  endTime: string;
  value: ResponseValue | null;
  onChange: (value: ResponseValue | null) => void;
  disabled?: boolean;
  /** Lock mode: entire row is locked (grayed out, all buttons disabled) */
  locked?: boolean;
  /** Warn mode: umpire has changed to "no" on this assigned slot */
  showWarning?: boolean;
  /** Match descriptions for warning display */
  assignedMatchLabels?: string[];
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
  locked,
  showWarning,
  assignedMatchLabels,
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

  const isFullyDisabled = disabled || locked;

  return (
    <div className="last:border-b-0">
      <div
        className={cn(
          "flex items-center justify-between border-b py-3",
          isFullyDisabled && "opacity-50",
          locked && "bg-muted/50 rounded-md px-2",
        )}
      >
        <div className="flex flex-col gap-0.5">
          <div className="text-sm">
            {formatTime(startTime)} &ndash; {formatTime(endTime)}
          </div>
          {locked && (
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
              <Lock className="h-3 w-3" />
              {t("slotLockedAssigned")}
            </div>
          )}
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
              disabled={isFullyDisabled}
            >
              {t(btn.labelKey)}
            </Button>
          ))}
        </div>
      </div>
      {showWarning && assignedMatchLabels && assignedMatchLabels.length > 0 && (
        <div className="flex items-start gap-1.5 px-1 py-1.5 text-xs text-orange-600 dark:text-orange-400">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {assignedMatchLabels.map((label, i) => (
              <span key={i}>
                {i > 0 && ", "}
                {t("assignedToMatch", { match: label })}
              </span>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
