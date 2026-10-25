"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncNow } from "@/lib/actions/hockey-sync";
import type { HockeySyncState } from "@/lib/types/domain";

type Props = {
  initialState: HockeySyncState | null;
  /** When a club website (LISA feed) was last polled, if the club has one. */
  initialFeedPolledAt?: string | null;
  onSynced: () => void;
};

export function SyncNowButton({
  initialState,
  initialFeedPolledAt = null,
  onSynced,
}: Props) {
  const t = useTranslations("matches");
  const format = useFormatter();
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    initialState?.last_synced_at ?? null,
  );
  const [feedPolledAt, setFeedPolledAt] = useState(initialFeedPolledAt);
  const [awaitingTime, setAwaitingTime] = useState(
    initialState?.awaiting_time_count ?? 0,
  );
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncNow();
      if (result.status === "cooldown") {
        toast.error(t("syncCooldown"));
        return;
      }
      if (result.status === "busy") {
        toast.error(t("syncBusy"));
        return;
      }
      const { detector, sync } = result;
      const changes = [detector, sync].filter((step) => step !== null);
      const counts = {
        inserted: changes.reduce((sum, step) => sum + step.inserted, 0),
        updated: changes.reduce((sum, step) => sum + step.updated, 0),
        flagged: changes.reduce(
          (sum, step) => sum + step.flagged + step.cancelled,
          0,
        ),
      };
      const problems = changes.reduce(
        (sum, step) => sum + step.errors.length,
        0,
      );
      if (problems > 0) {
        toast.warning(t("syncPartial", { ...counts, problems }));
      } else if (sync === null && detector !== null) {
        // Inside the full sync's cooldown: only the club websites were read.
        const checked = {
          checked: detector.confirmed,
          changed: counts.inserted + counts.updated + detector.cancelled,
        };
        if (detector.pending > 0) {
          // The Match Center budget ran out before every change was asked.
          toast.warning(
            t("syncDetectorPending", { ...checked, pending: detector.pending }),
          );
        } else {
          toast.success(t("syncDetectorChecked", checked));
        }
      } else {
        toast.success(t("syncSuccess", counts));
      }
      // The result already carries the new state — no extra round trip.
      const now = new Date().toISOString();
      if (sync) {
        setLastSyncedAt(now);
        setAwaitingTime(sync.awaitingTime);
      }
      if (detector && detector.polled > 0) setFeedPolledAt(now);
      onSynced();
    } catch {
      toast.error(t("syncError"));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground hidden text-right text-xs sm:block">
        {lastSyncedAt && (
          <p>
            {t("syncLastSynced", {
              time: format.relativeTime(new Date(lastSyncedAt)),
            })}
          </p>
        )}
        {feedPolledAt && (
          <p>
            {t("syncLastFeedPoll", {
              time: format.relativeTime(new Date(feedPolledAt)),
            })}
          </p>
        )}
        {awaitingTime > 0 && (
          <p>{t("syncAwaitingTime", { count: awaitingTime })}</p>
        )}
      </div>
      <Button variant="outline" onClick={handleSync} disabled={syncing}>
        {syncing ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <RefreshCw className="mr-2 h-4 w-4" />
        )}
        {syncing ? t("syncing") : t("syncNow")}
      </Button>
    </div>
  );
}
