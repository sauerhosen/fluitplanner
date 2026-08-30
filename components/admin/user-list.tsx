"use client";

import { useState } from "react";
import type {
  Organization,
  UserMembership,
  UserWithMemberships,
} from "@/lib/types/domain";
import {
  deleteUser,
  disableUser,
  enableUser,
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
import { MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatter } from "next-intl";
import { PageHeader } from "@/components/shared/page-header";
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
  // null = dialog closed. "" = inviting someone new; an address = inviting an
  // existing account to another club from its row menu.
  const [inviteEmail, setInviteEmail] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  /** Returns false when the list could not be reloaded. */
  async function refreshUsers(): Promise<boolean> {
    try {
      setUsers(await getUsers());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Run a mutation, surface whatever it throws, and refresh the table.
   * Destructive actions must not fail silently — the master admin needs to
   * know when a delete turned into a disable. An action returning a string
   * reports it as a success message.
   */
  async function run(action: () => Promise<string | void>) {
    setFeedback(null);
    try {
      const message = await action();
      // The mutation landed. If the reload did not, say so — otherwise the
      // table keeps showing the state from before the change.
      if (!(await refreshUsers())) {
        setFeedback({ type: "error", text: t("listOutOfDate") });
        return;
      }
      if (message) setFeedback({ type: "success", text: message });
    } catch (err) {
      setFeedback({
        type: "error",
        text: err instanceof Error ? err.message : t("errorOccurred"),
      });
      // A failed action is not a no-op: a delete that could not go through may
      // still have cleared the account's club memberships, and a disable bans
      // before it clears them. Reload so the table shows what actually stuck.
      await refreshUsers();
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
    void run(async () => {
      await resendInvite(userId);
      return t("inviteResent", { email });
    });
  }

  function handleRevokeInvite(userId: string, email: string) {
    if (!window.confirm(t("confirmRevokeInvite", { email }))) return;
    void run(() => revokePendingInvite(userId));
  }

  function handleDeleteUser(userId: string, email: string) {
    if (!window.confirm(t("confirmDeleteUser", { email }))) return;
    void run(async () => {
      const { outcome } = await deleteUser(userId);
      // The account owned records, so it was kept and disabled instead. Say so —
      // the admin asked for a delete and got something else.
      return outcome === "disabled"
        ? t("userDisabledInstead", { email })
        : undefined;
    });
  }

  function handleDisableUser(userId: string, email: string) {
    if (!window.confirm(t("confirmDisableUser", { email }))) return;
    void run(() => disableUser(userId));
  }

  function handleEnableUser(userId: string) {
    void run(() => enableUser(userId));
  }

  const feedbackBanner = feedback && (
    <p
      role="status"
      className={
        feedback.type === "error"
          ? "text-destructive text-sm"
          : "text-muted-foreground text-sm"
      }
    >
      {feedback.text}
    </p>
  );

  const header = (
    <PageHeader
      title={<h1 className="truncate text-xl font-semibold">{t("users")}</h1>}
      actions={
        <Button onClick={() => setInviteEmail("")}>
          <Plus className="mr-2 h-4 w-4" />
          {t("invitePlanner")}
        </Button>
      }
    />
  );

  const inviteDialog = (
    <InvitePlannerDialog
      open={inviteEmail !== null}
      onOpenChange={(open) => {
        if (!open) setInviteEmail(null);
      }}
      onSaved={refreshUsers}
      organizations={organizations}
      email={inviteEmail ?? ""}
    />
  );

  if (users.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <div className="flex flex-col items-center gap-4 py-12">
          {feedbackBanner}
          <p className="text-muted-foreground">{t("noUsers")}</p>
        </div>
        {inviteDialog}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}

      {feedbackBanner}

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
                    <span
                      className={
                        user.is_disabled
                          ? "text-muted-foreground line-through"
                          : undefined
                      }
                    >
                      {user.email}
                    </span>
                    {user.is_disabled && (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        {t("disabled")}
                      </Badge>
                    )}
                    {user.is_master_admin && (
                      <Badge variant="destructive">{t("masterAdmin")}</Badge>
                    )}
                    {user.is_pending_invite && !user.is_disabled && (
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
                      {user.is_disabled ? (
                        <DropdownMenuItem
                          onClick={() => handleEnableUser(user.id)}
                        >
                          {t("enableUser")}
                        </DropdownMenuItem>
                      ) : (
                        <>
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
                                      onValueChange={(role) => {
                                        // Radix fires this for the already
                                        // selected item too — don't round-trip
                                        // to the server for a no-op.
                                        if (role === m.role) return;
                                        handleRoleChange(
                                          user.id,
                                          m.organization_id,
                                          role as UserMembership["role"],
                                        );
                                      }}
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
                              {user.id !== currentUserId && (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() =>
                                    handleRevokeInvite(user.id, user.email)
                                  }
                                >
                                  {t("revokeInvite")}
                                </DropdownMenuItem>
                              )}
                            </>
                          )}

                          {user.id !== currentUserId && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onClick={() =>
                                  handleDisableUser(user.id, user.email)
                                }
                              >
                                {t("disableUser")}
                              </DropdownMenuItem>
                            </>
                          )}
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

      {inviteDialog}
    </div>
  );
}
