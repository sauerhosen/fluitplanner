"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { approveOauthRequest } from "@/lib/actions/oauth-consent";

type Props = {
  clientName: string;
  clientUri: string | null;
  organizations: { id: string; name: string }[];
  request: {
    client_id: string;
    redirect_uri: string;
    state?: string;
    code_challenge: string;
    resource?: string;
  };
  denyUrl: string;
};

export function ConsentForm({
  clientName,
  clientUri,
  organizations,
  request,
  denyUrl,
}: Props) {
  const t = useTranslations("oauth");
  const [organizationId, setOrganizationId] = useState(organizations[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setBusy(true);
    setError(null);
    try {
      const url = await approveOauthRequest({
        ...request,
        organization_id: organizationId,
      });
      window.location.assign(url);
    } catch {
      setError(t("error"));
      setBusy(false);
    }
  }

  function handleDeny() {
    setBusy(true);
    window.location.assign(denyUrl);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{t("connectTitle")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("connectRequest", { client: clientName })}
        </p>
        {clientUri && (
          <p className="text-muted-foreground truncate text-xs">{clientUri}</p>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <p className="font-medium">{t("scopeIntro")}</p>
        <ul className="text-muted-foreground list-disc space-y-1 pl-5">
          <li>{t("scopeRead")}</li>
          <li>{t("scopeWrite")}</li>
        </ul>
        <p className="text-muted-foreground">{t("scopeNot")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="oauth-club">{t("clubLabel")}</Label>
        <Select
          value={organizationId}
          onValueChange={setOrganizationId}
          disabled={busy || organizations.length === 1}
        >
          <SelectTrigger id="oauth-club" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {organizations.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                {org.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex gap-3">
        <Button onClick={handleApprove} disabled={busy} className="flex-1">
          {t("approve")}
        </Button>
        <Button
          onClick={handleDeny}
          disabled={busy}
          variant="outline"
          className="flex-1"
        >
          {t("deny")}
        </Button>
      </div>
    </div>
  );
}
