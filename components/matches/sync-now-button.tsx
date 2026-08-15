"use client";

import { useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncNow, getSyncState } from "@/lib/actions/hockey-sync";
import type { HockeySyncState } from "@/lib/types/domain";

type Props = {
  initialState: HockeySyncState | null;
  onSynced: () => void;
};

export function SyncNowButton({ initialState, onSynced }: Props) {
  const t = useTranslations("matches");
  const format = useFormatter();
  const [state, setState] = useState(initialState);
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncNow();
      toast.success(
        t("syncSuccess", {
          inserted: result.inserted,
          updated: result.updated,
          flagged: result.flagged + result.cancelled,
        }),
      );
      onSynced();
      try {
        setState(await getSyncState());
      } catch {
        // status line refresh failure is non-critical
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message === "SYNC_COOLDOWN"
          ? t("syncCooldown")
          : t("syncError");
      toast.error(message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground hidden text-right text-xs sm:block">
        {state?.last_synced_at && (
          <p>
            {t("syncLastSynced", {
              time: format.relativeTime(new Date(state.last_synced_at)),
            })}
          </p>
        )}
        {state !== null && state.awaiting_time_count > 0 && (
          <p>{t("syncAwaitingTime", { count: state.awaiting_time_count })}</p>
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
