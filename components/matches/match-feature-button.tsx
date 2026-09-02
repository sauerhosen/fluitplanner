"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  setMatchFeaturedByDefault,
  type FeatureRefusal,
} from "@/lib/actions/featured-matches";

const REFUSAL_KEYS: Record<FeatureRefusal, string> = {
  no_kickoff: "featureUnavailableNoKickoff",
  not_in_poll: "featureNotInPoll",
  match_not_found: "featureMatchNotFound",
};

export type FeaturableMatch = {
  id: string;
  start_time: string | null;
  featured_by_default: boolean;
};

type Props = {
  match: FeaturableMatch;
  onToggled?: (matchId: string, featured: boolean) => void;
};

/**
 * Toggles whether a match is revealed to umpires by default in the polls it
 * joins. Applies retroactively to open polls, so the number of already-shared
 * links it changed is reported rather than left silent.
 */
export function MatchFeatureButton({ match, onToggled }: Props) {
  const t = useTranslations("matches");
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState(match.featured_by_default);

  // Re-sync when the row is refetched underneath us.
  const [lastKnown, setLastKnown] = useState(match.featured_by_default);
  if (lastKnown !== match.featured_by_default) {
    setLastKnown(match.featured_by_default);
    setOptimistic(match.featured_by_default);
  }

  const hasKickoff = match.start_time !== null;

  function handleClick() {
    const next = !optimistic;
    setOptimistic(next);

    startTransition(async () => {
      try {
        const result = await setMatchFeaturedByDefault(match.id, next);
        if (!result.ok) {
          setOptimistic(!next);
          toast.error(t(REFUSAL_KEYS[result.reason]));
          return;
        }
        if (result.openPollsUpdated > 0) {
          // These are links umpires may already hold, so say so plainly.
          toast.success(
            next
              ? t("featureShownInOpenPolls", {
                  count: result.openPollsUpdated,
                })
              : t("featureHiddenInOpenPolls", {
                  count: result.openPollsUpdated,
                }),
          );
        }
        onToggled?.(match.id, next);
      } catch {
        // A thrown Server Action error is opaque by the time it lands here.
        setOptimistic(!next);
        toast.error(t("featureToggleError"));
      }
    });
  }

  const label = !hasKickoff
    ? t("featureUnavailableNoKickoff")
    : optimistic
      ? t("featureDefaultRemoveLabel")
      : t("featureDefaultAddLabel");

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={handleClick}
      disabled={!hasKickoff || pending}
      title={label}
      aria-label={label}
      aria-pressed={optimistic}
    >
      <Star
        className={cn(
          "h-3.5 w-3.5",
          optimistic
            ? "fill-current text-sky-600 dark:text-sky-400"
            : "text-muted-foreground",
        )}
      />
    </Button>
  );
}
