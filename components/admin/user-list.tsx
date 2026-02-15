"use client";

import { useState } from "react";
import type { Organization, UserWithMemberships } from "@/lib/types/domain";
import { getUsers, removeUserFromOrg } from "@/lib/actions/admin";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatter } from "next-intl";
import { InvitePlannerDialog } from "./invite-planner-dialog";

export function UserList({
  users: initialUsers,
  organizations,
}: {
  users: UserWithMemberships[];
  organizations: Organization[];
}) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [users, setUsers] = useState<UserWithMemberships[]>(initialUsers);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);

  async function refreshUsers() {
    const data = await getUsers();
    setUsers(data);
  }

  async function handleRemoveFromOrg(
    userId: string,
    organizationId: string,
    orgName: string,
  ) {
    const confirmed = window.confirm(
      t("confirmRemoveFromOrg", { org: orgName }),
    );
    if (!confirmed) return;
    await removeUserFromOrg(userId, organizationId);
    await refreshUsers();
  }

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <p className="text-muted-foreground">{t("noUsers")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("emailHeader")}</TableHead>
              <TableHead>{t("membershipsHeader")}</TableHead>
              <TableHead>{t("createdHeader")}</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {user.email}
                    {user.is_master_admin && (
                      <Badge variant="destructive">{t("masterAdmin")}</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.memberships.length === 0 ? (
                      <span className="text-muted-foreground text-sm">—</span>
                    ) : (
                      user.memberships.map((m) => (
                        <Badge
                          key={m.organization_id}
                          variant="outline"
                          className="text-xs"
                        >
                          {m.organization_name}
                          <span className="ml-1 text-muted-foreground">
                            ({t(m.role)})
                          </span>
                        </Badge>
                      ))
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format.dateTime(new Date(user.created_at), {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => setInviteEmail(user.email)}
                      >
                        {t("inviteToOrg")}
                      </DropdownMenuItem>
                      {user.memberships.length > 0 && (
                        <>
                          <DropdownMenuSeparator />
                          {user.memberships.map((m) => (
                            <DropdownMenuItem
                              key={m.organization_id}
                              onClick={() =>
                                handleRemoveFromOrg(
                                  user.id,
                                  m.organization_id,
                                  m.organization_name,
                                )
                              }
                            >
                              {t("removeFromOrg", {
                                org: m.organization_name,
                              })}
                            </DropdownMenuItem>
                          ))}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <InvitePlannerDialog
        open={inviteEmail !== null}
        onOpenChange={(open) => {
          if (!open) setInviteEmail(null);
        }}
        onSaved={refreshUsers}
        organizations={organizations}
        email={inviteEmail ?? ""}
      />
    </div>
  );
}
