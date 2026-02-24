"use client";

import { useState, useTransition } from "react";
import { updateAvailabilityGuardPolicy } from "@/lib/actions/settings";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import type { AvailabilityGuardPolicy } from "@/lib/types/availability";

type Props = {
  initialPolicy: AvailabilityGuardPolicy;
  canEdit: boolean;
};

export function AvailabilityGuardSettings({ initialPolicy, canEdit }: Props) {
  const t = useTranslations("settings");
  const [policy, setPolicy] = useState<AvailabilityGuardPolicy>(initialPolicy);
  const [savedPolicy, setSavedPolicy] =
    useState<AvailabilityGuardPolicy>(initialPolicy);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isDirty = policy !== savedPolicy;

  function handleSave() {
    setError(null);
    setSaved(false);

    startTransition(async () => {
      try {
        await updateAvailabilityGuardPolicy(policy);
        setSavedPolicy(policy);
        setSaved(true);
      } catch {
        setError(t("guardPolicyError"));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{t("guardPolicyTitle")}</h3>
        <p className="text-muted-foreground text-sm">{t("guardPolicyHelp")}</p>
      </div>

      <RadioGroup
        value={policy}
        onValueChange={(value) => {
          setPolicy(value as AvailabilityGuardPolicy);
          setSaved(false);
          setError(null);
        }}
        disabled={!canEdit || isPending}
        className="space-y-3"
      >
        <div className="flex items-start gap-3 rounded-md border p-3">
          <RadioGroupItem value="warn" id="guard-policy-warn" />
          <div className="space-y-1">
            <Label htmlFor="guard-policy-warn">
              {t("guardPolicyWarnLabel")}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t("guardPolicyWarnHelp")}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-md border p-3">
          <RadioGroupItem value="block" id="guard-policy-block" />
          <div className="space-y-1">
            <Label htmlFor="guard-policy-block">
              {t("guardPolicyBlockLabel")}
            </Label>
            <p className="text-muted-foreground text-sm">
              {t("guardPolicyBlockHelp")}
            </p>
          </div>
        </div>
      </RadioGroup>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={handleSave}
          disabled={!canEdit || !isDirty || isPending}
        >
          {isPending ? t("guardPolicySaving") : t("guardPolicySave")}
        </Button>
        {!canEdit && (
          <p className="text-muted-foreground text-sm">
            {t("guardPolicyReadOnly")}
          </p>
        )}
        {saved && (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            {t("guardPolicySaved")}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
