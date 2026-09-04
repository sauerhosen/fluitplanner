"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsPlanner } from "@/components/shared/role-provider";
import { cn } from "@/lib/utils";
import {
  setPollMatchFeatured,
  type FeatureRefusal,
} from "@/lib/actions/featured-matches";

const REFUSAL_KEYS: Record<FeatureRefusal, string> = {
  no_kickoff: "featureUnavailableNoKickoff",
  not_in_poll: "featureNotInPoll",
  match_not_found: "featureMatchNotFound",
};

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
  // Viewers see the featured state without being offered to change it.
  const readOnly = !useIsPlanner();
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
        const result = await setPollMatchFeatured(pollId, matchId, next);
        if (!result.ok) {
          setOptimistic(!next);
          setError(t(REFUSAL_KEYS[result.reason]));
          return;
        }
        onToggled?.(matchId, next);
      } catch {
        // A thrown Server Action error reaches the browser as an opaque
        // Next.js string, so show our own wording rather than surfacing it.
        setOptimistic(!next);
        setError(t("featureToggleError"));
      }
    });
  }

  const label = disabled
    ? t("featureUnavailableNoKickoff")
    : isFeatured
      ? t("featureRemoveLabel")
      : t("featureAddLabel");

  // Read-only: the lit star still says which matches umpires get to see, an
  // unlit one has nothing to say.
  if (readOnly) {
    if (!isFeatured) return null;
    return (
      <span
        className="inline-flex h-7 w-7 items-center justify-center"
        data-testid="poll-match-featured-indicator"
        role="img"
        aria-label={t("featuredIndicatorLabel")}
      >
        <Star className="h-3.5 w-3.5 fill-current text-sky-600 dark:text-sky-400" />
      </span>
    );
  }

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
