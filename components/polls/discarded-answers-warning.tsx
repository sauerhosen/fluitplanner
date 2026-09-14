"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Shown while editing a poll's matches when saving would delete answers:
 * slots that disappear, or move by more than a quarter hour, take their
 * umpires' answers with them.
 */
export function DiscardedAnswersWarning({ count }: { count: number }) {
  const t = useTranslations("polls");

  if (count === 0) return null;

  return (
    <p
      role="status"
      className="flex items-start gap-1.5 text-sm text-orange-700 dark:text-orange-400"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {t("matchChangeDiscardsAnswers", { count })}
    </p>
  );
}
