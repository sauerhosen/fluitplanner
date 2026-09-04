"use client";

import { createContext, useContext } from "react";
import type { MemberRole } from "@/lib/types/domain";

/**
 * The signed-in user's role in the current club, provided once by the
 * authenticated layout. Absent a provider the role is unknown and treated as
 * read-only: hiding a control is never a security decision — server actions
 * and RLS enforce the role — so the safe default is to show nothing.
 */
const RoleContext = createContext<MemberRole | null>(null);

export function RoleProvider({
  role,
  children,
}: {
  role: MemberRole | null;
  children: React.ReactNode;
}) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useMemberRole(): MemberRole | null {
  return useContext(RoleContext);
}

/** True when the current user may change club data. Viewers get false. */
export function useIsPlanner(): boolean {
  return useContext(RoleContext) === "planner";
}
