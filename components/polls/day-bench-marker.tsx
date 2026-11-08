"use client";

import { UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RosteredUmpire } from "@/lib/types/domain";
import type { DayAvailability } from "@/lib/domain/available-unassigned";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Props = {
  date: string;
  /** Umpires in grid order, so the list reads like the grid does. */
  umpires: RosteredUmpire[];
  /** Umpire id → their best answer that day; only those not yet assigned. */
  bench: Map<string, DayAvailability> | undefined;
};

/** Solid green / yellow dots for the answers, matching the poll page buttons. */
const DOT: Record<DayAvailability, string> = {
  yes: "bg-green-500",
  if_need_be: "bg-yellow-500",
};

/**
 * Sits in a day's header and counts the umpires who said they can make that
 * day but are not on any of its matches yet; opening it names them. Read-only,
 * so viewers get it too.
 */
export function DayBenchMarker({ date, umpires, bench }: Props) {
  const t = useTranslations("polls");
  const listed = bench
    ? umpires.flatMap((u) => {
        const answer = bench.get(u.id);
        return answer ? [{ umpire: u, answer }] : [];
      })
    : [];
  if (listed.length === 0) return null;

  const label = t("dayBenchLabel", { count: listed.length });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          data-testid={`day-bench-${date}`}
          className="inline-flex shrink-0 cursor-pointer items-center gap-0.5 rounded px-1 text-[11px] font-normal normal-case tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <UserCheck className="h-3.5 w-3.5" />
          {listed.length}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        <p className="mb-2 text-xs text-muted-foreground">
          {t("dayBenchHint")}
        </p>
        <ul
          className="flex flex-col gap-1 text-sm"
          data-testid={`day-bench-list-${date}`}
        >
          {listed.map(({ umpire: u, answer }) => (
            <li
              key={u.id}
              data-testid={`day-bench-${u.id}`}
              data-availability={answer}
              className="flex items-center gap-2"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${DOT[answer]}`}
                aria-hidden
              />
              <span className="truncate">{u.name}</span>
              {answer === "if_need_be" && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {t("ifNeedBeLabel")}
                </span>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
