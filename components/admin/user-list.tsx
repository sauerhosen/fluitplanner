"use client";

import { useState } from "react";
import type {
  Organization,
  UserMembership,
  UserWithMemberships,
} from "@/lib/types/domain";
import {
  deleteUser,
  getUsers,
  removeUserFromOrg,
  resendInvite,
  revokePendingInvite,
  updateMemberRole,
} from "@/lib/actions/admin";
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
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatter } from "next-intl";
import { InvitePlannerDialog } from "./invite-planner-dialog";

type Feedback = { type: "error" | "success"; text: string };

export function UserList({
  users: initialUsers,
  organizations,
  currentUserId,
}: {
  users: UserWithMemberships[];
  organizations: Organization[];
  currentUserId: string;
}) {
  const t = useTranslations("admin");
  const format = useFormatter();
  const [users, setUsers] = useState<UserWithMemberships[]>(initialUsers);
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function refreshUsers() {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {
      // Silently fail — list remains stale
    }
  }

  /**
   * Run a mutation, surface whatever it throws, and refresh the table.
   * Destructive actions must not fail silently — the master admin needs to
   * know when a delete was refused (e.g. the user still owns matches).
   */
  async function run(action: () => Promise<void>, successText?: string) {
    setFeedback(null);
    try {
      await action();
      if (successText) setFeedback({ type: "success", text: successText });
      await refreshUsers();
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : t("errorOccurred"),
      });
    }
  }

  function handleRemoveFromOrg(
    userId: string,
    organizationId: string,
    orgName: string,
  ) {
    if (!window.confirm(t("confirmRemoveFromOrg", { org: orgName }))) return;
    void run(() => removeUserFromOrg(userId, organizationId));
  }

  function handleRoleChange(
    userId: string,
    organizationId: string,
    role: UserMembership["role"],
  ) {
    void run(() => updateMemberRole(userId, organizationId, role));
  }

  function handleResendInvite(userId: string, email: string) {
    void run(() => resendInvite(userId), t("inviteResent", { email }));
  }

  function handleRevokeInvite(userId: string, email: string) {
    if (!window.confirm(t("confirmRevokeInvite", { email }))) return;
    void run(() => revokePendingInvite(userId));
  }

  function handleDeleteUser(userId: string, email: string) {
    if (!window.confirm(t("confirmDeleteUser", { email }))) return;
    void run(() => deleteUser(userId));
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
      {feedback && (
        <p
          role="status"
          className={
            feedback.type === "error"
              ? "text-sm text-destructive"
              : "text-muted-foreground text-sm"
          }
        >
          {feedback.text}
        </p>
      )}

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
                  <div className="flex flex-wrap items-center gap-2">
                    {user.email}
                    {user.is_master_admin && (
                      <Badge variant="destructive">{t("masterAdmin")}</Badge>
                    )}
                    {user.is_pending_invite && (
                      <Badge variant="secondary">{t("pendingInvite")}</Badge>
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
                          <span className="text-muted-foreground ml-1">
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
                        <span className="sr-only">
                          {t("actionsFor", { email: user.email })}
                        </span>
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
                            <DropdownMenuSub key={m.organization_id}>
                              <DropdownMenuSubTrigger>
                                {m.organization_name}
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                <DropdownMenuRadioGroup
                                  value={m.role}
                                  onValueChange={(role) =>
                                    handleRoleChange(
                                      user.id,
                                      m.organization_id,
                                      role as UserMembership["role"],
                                    )
                                  }
                                >
                                  <DropdownMenuRadioItem value="planner">
                                    {t("planner")}
                                  </DropdownMenuRadioItem>
                                  <DropdownMenuRadioItem value="viewer">
                                    {t("viewer")}
                                  </DropdownMenuRadioItem>
                                </DropdownMenuRadioGroup>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  variant="destructive"
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
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          ))}
                        </>
                      )}

                      {user.is_pending_invite && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              handleResendInvite(user.id, user.email)
                            }
                          >
                            {t("resendInvite")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              handleRevokeInvite(user.id, user.email)
                            }
                          >
                            {t("revokeInvite")}
                          </DropdownMenuItem>
                        </>
                      )}

                      {user.id !== currentUserId && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() =>
                              handleDeleteUser(user.id, user.email)
                            }
                          >
                            {t("deleteUser")}
                          </DropdownMenuItem>
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
