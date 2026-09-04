"use client";

import { useState } from "react";
import type { MemberRole, Organization } from "@/lib/types/domain";
import { invitePlanner } from "@/lib/actions/admin";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";

export function InvitePlannerDialog({
  open,
  onOpenChange,
  onSaved,
  organizations,
  email: initialEmail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  organizations: Organization[];
  email?: string;
}) {
  const t = useTranslations("admin");

  const [email, setEmail] = useState(initialEmail ?? "");
  const [organizationId, setOrganizationId] = useState("");
  const [role, setRole] = useState<MemberRole>("planner");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setEmail(initialEmail ?? "");
      setOrganizationId("");
      setRole("planner");
      setSaving(false);
      setError(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !organizationId) return;

    setSaving(true);
    try {
      await invitePlanner(organizationId, email.trim(), role);
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  const activeOrganizations = organizations.filter((o) => o.is_active);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("invitePlanner")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">{t("email")}</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-org">{t("selectOrganization")}</Label>
            <Select value={organizationId} onValueChange={setOrganizationId}>
              <SelectTrigger id="invite-org">
                <SelectValue placeholder={t("selectOrganization")} />
              </SelectTrigger>
              <SelectContent>
                {activeOrganizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-role">{t("role")}</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as MemberRole)}
            >
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planner">{t("planner")}</SelectItem>
                <SelectItem value="viewer">{t("viewer")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {role === "viewer" ? t("roleViewerHelp") : t("rolePlannerHelp")}
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={saving || !organizationId}>
              {saving ? t("inviting") : t("invite")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
