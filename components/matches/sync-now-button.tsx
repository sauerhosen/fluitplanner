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
  onSynced: () => void;
};

export function SyncNowButton({ initialState, onSynced }: Props) {
  const t = useTranslations("matches");
  const format = useFormatter();
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
    initialState?.last_synced_at ?? null,
  );
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
      const counts = {
        inserted: result.inserted,
        updated: result.updated,
        flagged: result.flagged + result.cancelled,
      };
      if (result.errors.length > 0) {
        toast.warning(
          t("syncPartial", { ...counts, problems: result.errors.length }),
        );
      } else {
        toast.success(t("syncSuccess", counts));
      }
      // The result already carries the new state — no extra round trip.
      setLastSyncedAt(new Date().toISOString());
      setAwaitingTime(result.awaitingTime);
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
