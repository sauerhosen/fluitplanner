"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { addClubFeed, removeClubFeed } from "@/lib/actions/club-feeds";
import type { ClubFeed } from "@/lib/types/domain";

type Props = {
  initialFeeds: ClubFeed[];
  canEdit?: boolean;
};

const STATUS_VARIANT = {
  success: "secondary",
  partial: "outline",
  error: "destructive",
} as const;

export function ClubFeedsSettings({ initialFeeds, canEdit = true }: Props) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const [feeds, setFeeds] = useState<ClubFeed[]>(initialFeeds);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [feedToRemove, setFeedToRemove] = useState<ClubFeed | null>(null);
  const [removing, setRemoving] = useState(false);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setAdding(true);
    try {
      const result = await addClubFeed(url);
      if (result.status === "added") {
        setFeeds((prev) => [...prev, result.feed]);
        setUrl("");
        toast.success(t("clubFeedsAdded", { host: result.feed.host }));
      } else {
        const messages = {
          invalid_url: t("clubFeedsInvalidUrl"),
          unreachable: t("clubFeedsUnreachable"),
          not_lisa: t("clubFeedsNotLisa"),
          duplicate: t("clubFeedsDuplicate"),
          limit: t("clubFeedsLimit"),
        };
        toast.error(messages[result.status]);
      }
    } catch {
      toast.error(t("clubFeedsAddError"));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove() {
    if (!feedToRemove) return;
    setRemoving(true);
    try {
      await removeClubFeed(feedToRemove.id);
      setFeeds((prev) => prev.filter((feed) => feed.id !== feedToRemove.id));
      setFeedToRemove(null);
    } catch {
      toast.error(t("clubFeedsRemoveError"));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">{t("clubFeedsTitle")}</h3>
      <p className="text-muted-foreground text-sm">{t("clubFeedsSubtitle")}</p>
      {feeds.length === 0 ? (
        <p className="text-muted-foreground text-sm italic">
          {t("clubFeedsEmpty")}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {feeds.map((feed) => (
            <li
              key={feed.id}
              className="flex items-center justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{feed.host}</p>
                <p className="text-muted-foreground text-xs">
                  {feed.last_polled_at
                    ? t("clubFeedsLastPolled", {
                        time: format.relativeTime(
                          new Date(feed.last_polled_at),
                        ),
                      })
                    : t("clubFeedsNeverPolled")}
                  {feed.last_poll_error && (
                    <span
                      className="block truncate"
                      title={feed.last_poll_error}
                    >
                      {feed.last_poll_error}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!feed.apply_changes && (
                  <Badge variant="outline" title={t("clubFeedsShadowHint")}>
                    {t("clubFeedsShadow")}
                  </Badge>
                )}
                {feed.last_poll_status && (
                  <Badge variant={STATUS_VARIANT[feed.last_poll_status]}>
                    {t(`clubFeedsStatus_${feed.last_poll_status}`)}
                  </Badge>
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFeedToRemove(feed)}
                    aria-label={t("clubFeedsRemove")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form
          onSubmit={handleAdd}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <Input
            type="text"
            inputMode="url"
            autoComplete="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t("clubFeedsPlaceholder")}
            aria-label={t("clubFeedsUrlLabel")}
            disabled={adding}
            className="sm:max-w-sm"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={adding || !url.trim()}
          >
            {adding ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            {t("clubFeedsAdd")}
          </Button>
        </form>
      )}

      <AlertDialog
        open={feedToRemove !== null}
        onOpenChange={(open) => {
          if (!open) setFeedToRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clubFeedsRemove")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("clubFeedsRemoveConfirm", { host: feedToRemove?.host ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove} disabled={removing}>
              {t("clubFeedsRemove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
