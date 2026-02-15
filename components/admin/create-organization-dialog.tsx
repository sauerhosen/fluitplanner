"use client";

import { useState, useEffect } from "react";
import type { Organization } from "@/lib/types/domain";
import { createOrganization, updateOrganization } from "@/lib/actions/admin";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "next-intl";

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && SLUG_REGEX.test(slug);
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  onSaved,
  organization,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  organization?: Organization | null;
}) {
  const t = useTranslations("admin");
  const isEditing = !!organization;

  const [name, setName] = useState(organization?.name ?? "");
  const [slug, setSlug] = useState(organization?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when dialog opens/closes or organization changes
  useEffect(() => {
    if (open) {
      setName(organization?.name ?? "");
      setSlug(organization?.slug ?? "");
      setSlugTouched(isEditing);
      setSaving(false);
      setError(null);
    }
  }, [open, organization, isEditing]);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched && !isEditing) {
      setSlug(generateSlug(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return;
    if (!isEditing && !isValidSlug(slug)) {
      setError(
        "Invalid slug: must be lowercase alphanumeric with hyphens, at least 2 characters",
      );
      return;
    }

    setSaving(true);
    try {
      if (isEditing && organization) {
        await updateOrganization(organization.id, { name: name.trim() });
      } else {
        await createOrganization(name.trim(), slug);
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t("editOrganization") : t("createOrganization")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="org-name">{t("name")}</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
          </div>

          {!isEditing && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="org-slug">{t("slug")}</Label>
              <Input
                id="org-slug"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">{t("slugHelp")}</p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "..." : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
