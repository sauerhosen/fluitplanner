"use client";

import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

type Props = {
  visible: boolean;
  saving: boolean;
  saved: boolean;
  error: string | null;
  disabled: boolean;
  onSave: () => void;
};

export function StickyDirtyBar({
  visible,
  saving,
  saved,
  error,
  disabled,
  onSave,
}: Props) {
  const t = useTranslations("pollResponse");

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ease-in-out ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="border-t bg-background/95 backdrop-blur-sm dark:bg-background/90">
        <div className="mx-auto max-w-lg px-4 py-3">
          {error ? (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={onSave}
                disabled={disabled || saving}
              >
                {t("retryButton")}
              </Button>
            </div>
          ) : saved ? (
            <p className="text-center text-sm font-medium text-green-600 dark:text-green-400">
              {t("savedSuccess")}
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground text-sm">
                {t("unsavedChanges")}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={onSave}
                disabled={disabled || saving}
              >
                {saving ? t("savingButton") : t("saveChangesButton")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
