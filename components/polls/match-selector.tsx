"use client";

import type { Match } from "@/lib/types/domain";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslations, useFormatter } from "next-intl";

type Props = {
  matches: Match[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
};

export function MatchSelector({
  matches,
  selectedIds,
  onSelectionChange,
}: Props) {
  const t = useTranslations("polls");
  const format = useFormatter();

  function formatMatchDate(dateStr: string): string {
    return format.dateTime(new Date(dateStr + "T00:00:00"), {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  function formatMatchTime(startTime: string): string {
    return format.dateTime(new Date(startTime), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  if (matches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {t("noMatchesAvailable")}
      </p>
    );
  }

  const grouped = new Map<string, Match[]>();
  for (const match of matches) {
    const existing = grouped.get(match.date) ?? [];
    existing.push(match);
    grouped.set(match.date, existing);
  }

  function toggleMatch(matchId: string) {
    const newIds = selectedIds.includes(matchId)
      ? selectedIds.filter((id) => id !== matchId)
      : [...selectedIds, matchId];
    onSelectionChange(newIds);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...grouped.entries()].map(([date, dateMatches]) => (
        <div key={date}>
          <h4 className="text-sm font-medium mb-2">{formatMatchDate(date)}</h4>
          <div className="flex flex-col gap-1">
            {dateMatches.map((match) => (
              <label
                key={match.id}
                className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent"
              >
                <Checkbox
                  checked={selectedIds.includes(match.id)}
                  onCheckedChange={() => toggleMatch(match.id)}
                />
                <div className="flex-1 text-sm">
                  <span className="font-medium">
                    <span>{match.home_team}</span>
                    {" – "}
                    <span>{match.away_team}</span>
                  </span>
                  {match.start_time && (
                    <span className="text-muted-foreground ml-2">
                      {formatMatchTime(match.start_time)}
                    </span>
                  )}
                  {match.competition && (
                    <span className="text-muted-foreground ml-2">
                      · {match.competition}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
