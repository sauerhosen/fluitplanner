"use client";

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
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affectedMatches: { homeTeam: string; awayTeam: string }[];
  onConfirm: () => void;
};

export function AssignmentWarningDialog({
  open,
  onOpenChange,
  affectedMatches,
  onConfirm,
}: Props) {
  const t = useTranslations("pollResponse");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            {t("warningDialogTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>{t("warningDialogDescription")}</p>
              <ul className="list-disc space-y-1 pl-5">
                {affectedMatches.map((match, i) => (
                  <li key={i}>
                    {match.homeTeam} vs {match.awayTeam}
                  </li>
                ))}
              </ul>
              <p className="font-medium">{t("warningDialogNotice")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("warningDialogCancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t("warningDialogProceed")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
