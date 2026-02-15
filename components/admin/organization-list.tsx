"use client";

import { useState } from "react";
import type { Organization } from "@/lib/types/domain";
import { getOrganizations, updateOrganization } from "@/lib/actions/admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { CreateOrganizationDialog } from "./create-organization-dialog";

export function OrganizationList({
  organizations: initialOrganizations,
}: {
  organizations: Organization[];
}) {
  const t = useTranslations("admin");
  const [organizations, setOrganizations] =
    useState<Organization[]>(initialOrganizations);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);

  async function refreshOrganizations() {
    const data = await getOrganizations();
    setOrganizations(data);
  }

  async function handleToggleActive(org: Organization) {
    if (org.is_active) {
      const confirmed = window.confirm(t("confirmDisable"));
      if (!confirmed) return;
    }
    await updateOrganization(org.id, { is_active: !org.is_active });
    await refreshOrganizations();
  }

  if (organizations.length === 0 && !showCreateDialog) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-muted-foreground">{t("noOrganizations")}</p>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("createOrganization")}
        </Button>
        <CreateOrganizationDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onSaved={refreshOrganizations}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {t("createOrganization")}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("slug")}</TableHead>
              <TableHead className="text-center">{t("status")}</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {organizations.map((org) => (
              <TableRow key={org.id}>
                <TableCell className="font-medium">{org.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {org.slug}
                </TableCell>
                <TableCell className="text-center">
                  {org.is_active ? (
                    <Badge variant="default">{t("active")}</Badge>
                  ) : (
                    <Badge variant="secondary">{t("inactive")}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">{t("editOrganization")}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingOrg(org)}>
                        {t("editOrganization")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleActive(org)}>
                        {org.is_active ? t("disable") : t("enable")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create dialog */}
      <CreateOrganizationDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSaved={refreshOrganizations}
      />

      {/* Edit dialog */}
      {editingOrg && (
        <CreateOrganizationDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingOrg(null);
          }}
          onSaved={refreshOrganizations}
          organization={editingOrg}
        />
      )}
    </div>
  );
}
