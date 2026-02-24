"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Lock, AlertTriangle } from "lucide-react";
import { updateAvailabilityLockMode } from "@/lib/actions/organization-settings";
import type { AvailabilityLockMode } from "@/lib/types/domain";

type Props = {
  initialMode: AvailabilityLockMode;
};

export function AvailabilityLockSetting({ initialMode }: Props) {
  const t = useTranslations("settings");
  const [mode, setMode] = useState<AvailabilityLockMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(value: string) {
    const newMode = value as AvailabilityLockMode;
    setSaving(true);
    setError(null);
    try {
      await updateAvailabilityLockMode(newMode);
      setMode(newMode);
    } catch {
      setError(t("settingError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {t("availabilityLockDescription")}
      </p>
      <RadioGroup
        value={mode}
        onValueChange={handleChange}
        disabled={saving}
        className="space-y-2"
      >
        <div className="flex items-start gap-3">
          <RadioGroupItem value="warn" id="lock-mode-warn" className="mt-1" />
          <Label
            htmlFor="lock-mode-warn"
            className="cursor-pointer space-y-0.5"
          >
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              {t("lockModeWarn")}
            </div>
            <p className="text-muted-foreground text-sm font-normal">
              {t("lockModeWarnDescription")}
            </p>
          </Label>
        </div>
        <div className="flex items-start gap-3">
          <RadioGroupItem value="lock" id="lock-mode-lock" className="mt-1" />
          <Label
            htmlFor="lock-mode-lock"
            className="cursor-pointer space-y-0.5"
          >
            <div className="flex items-center gap-1.5 font-medium">
              <Lock className="h-4 w-4" />
              {t("lockModeLock")}
            </div>
            <p className="text-muted-foreground text-sm font-normal">
              {t("lockModeLockDescription")}
            </p>
          </Label>
        </div>
      </RadioGroup>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}
