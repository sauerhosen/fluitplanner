"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import { PasskeyButton } from "@/components/passkey/passkey-button";
import { Button } from "@/components/ui/button";
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
import { createClient } from "@/lib/supabase/client";

export type PasskeyInfo = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

type Props = {
  passkeys: PasskeyInfo[];
  /** True when the list could not be loaded — enrolment still works. */
  listFailed?: boolean;
};

/**
 * Passkey enrolment and removal for the signed-in user.
 *
 * Per-user, not per-club: a viewer must be able to enrol just as a planner can,
 * which is why this lives on `/protected/account` rather than the club-scoped
 * settings page.
 */
export function PasskeySettings({ passkeys, listFailed = false }: Props) {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [toDelete, setToDelete] = useState<PasskeyInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  function formatDate(value: string) {
    return format.dateTime(new Date(value), {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function nameOf(passkey: PasskeyInfo) {
    return passkey.friendly_name || t("passkeyUnnamed");
  }

  async function handleDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.passkey.delete({
        passkeyId: toDelete.id,
      });
      if (error) throw error;
      setToDelete(null);
      // The list is server-rendered, so re-fetch rather than mutating locally.
      router.refresh();
    } catch {
      toast.error(t("passkeyDeleteError"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t("passkeyDescription")}</p>

      {passkeys.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {listFailed ? t("passkeyListError") : t("passkeyNone")}
        </p>
      ) : (
        <ul className="divide-border divide-y rounded-md border">
          {passkeys.map((passkey) => (
            <li
              key={passkey.id}
              className="flex items-center justify-between gap-3 p-3"
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-medium">{nameOf(passkey)}</span>
                <span className="text-muted-foreground text-xs">
                  {t("passkeyAdded", { date: formatDate(passkey.created_at) })}
                  {passkey.last_used_at
                    ? ` · ${t("passkeyLastUsed", {
                        date: formatDate(passkey.last_used_at),
                      })}`
                    : ""}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("passkeyDeleteLabel", { name: nameOf(passkey) })}
                onClick={() => setToDelete(passkey)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Enrolling inline (on the ceremony origin) leaves the page standing, so
          the server-rendered list has to be re-fetched. A cross-origin bounce
          comes back through a fresh render and needs nothing. */}
      <PasskeyButton
        mode="enroll"
        onEnrolled={() => router.refresh()}
        className="sm:max-w-xs"
      />

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("passkeyDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("passkeyDeleteConfirm", {
                name: toDelete ? nameOf(toDelete) : "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? tCommon("deleting") : tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
