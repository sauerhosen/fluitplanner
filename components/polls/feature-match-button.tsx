"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setPollMatchFeatured } from "@/lib/actions/featured-matches";

type Props = {
  pollId: string;
  matchId: string;
  featured: boolean;
  /** A match with no kick-off time is in no slot, so it cannot be featured. */
  disabled?: boolean;
  onToggled?: (matchId: string, featured: boolean) => void;
};

/**
 * Toggles whether one match's details are revealed to umpires on the public
 * poll page. Optimistic, reverting on failure so the star never claims a
 * visibility the database did not accept.
 */
export function FeatureMatchButton({
  pollId,
  matchId,
  featured,
  disabled,
  onToggled,
}: Props) {
  const t = useTranslations("polls");
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(featured);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the flag changes underneath us — a poll refetch elsewhere on
  // the page must not leave the star showing a stale visibility.
  const [lastKnown, setLastKnown] = useState(featured);
  if (lastKnown !== featured) {
    setLastKnown(featured);
    setOptimistic(featured);
  }

  const isFeatured = optimistic;

  function handleClick() {
    const next = !isFeatured;
    setOptimistic(next);
    setError(null);
    startTransition(async () => {
      try {
        await setPollMatchFeatured(pollId, matchId, next);
        onToggled?.(matchId, next);
      } catch (err) {
        setOptimistic(!next);
        setError(err instanceof Error ? err.message : t("featureToggleError"));
      }
    });
  }

  const label = disabled
    ? t("featureUnavailableNoKickoff")
    : isFeatured
      ? t("featureRemoveLabel")
      : t("featureAddLabel");

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={handleClick}
      disabled={disabled || pending}
      title={error ?? label}
      aria-label={label}
      aria-pressed={isFeatured}
    >
      <Star
        className={cn(
          "h-3.5 w-3.5",
          isFeatured
            ? "fill-current text-sky-600 dark:text-sky-400"
            : "text-muted-foreground",
          error && "text-destructive",
        )}
      />
    </Button>
  );
}
