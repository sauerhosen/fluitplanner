"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import type {
  Assignment,
  AssignmentStatus,
  RosteredUmpire,
  Umpire,
} from "@/lib/types/domain";
import { revalidatePath } from "next/cache";

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export async function getAssignmentsForPoll(
  pollId: string,
): Promise<Assignment[]> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("assignments")
    .select("*")
    .eq("poll_id", pollId)
    .eq("organization_id", tenantId);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createAssignment(
  pollId: string,
  matchId: string,
  umpireId: string,
  status: AssignmentStatus = "confirmed",
): Promise<Assignment> {
  const { supabase } = await requireAuth();

  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("assignments")
    .insert({
      poll_id: pollId,
      match_id: matchId,
      umpire_id: umpireId,
      organization_id: tenantId,
      status,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/protected/polls/${pollId}`);
  return data;
}

/** Promote a tentative appointment to confirmed, or demote a confirmed one. */
export async function setAssignmentStatus(
  pollId: string,
  matchId: string,
  umpireId: string,
  status: AssignmentStatus,
): Promise<Assignment> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("assignments")
    .update({ status })
    .eq("poll_id", pollId)
    .eq("match_id", matchId)
    .eq("umpire_id", umpireId)
    .eq("organization_id", tenantId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/protected/polls/${pollId}`);
  return data;
}

/** Confirm every tentative appointment in a poll. Returns how many changed. */
export async function confirmTentativeAssignments(
  pollId: string,
): Promise<number> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("assignments")
    .update({ status: "confirmed" })
    .eq("poll_id", pollId)
    .eq("organization_id", tenantId)
    .eq("status", "tentative")
    .select("id");

  if (error) throw new Error(error.message);
  revalidatePath(`/protected/polls/${pollId}`);
  return data?.length ?? 0;
}

/** Discard every tentative appointment in a poll. Returns how many were removed. */
export async function clearTentativeAssignments(
  pollId: string,
): Promise<number> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data, error } = await supabase
    .from("assignments")
    .delete()
    .eq("poll_id", pollId)
    .eq("organization_id", tenantId)
    .eq("status", "tentative")
    .select("id");

  if (error) throw new Error(error.message);
  revalidatePath(`/protected/polls/${pollId}`);
  return data?.length ?? 0;
}

export async function deleteAssignment(
  pollId: string,
  matchId: string,
  umpireId: string,
): Promise<void> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { error } = await supabase
    .from("assignments")
    .delete()
    .eq("poll_id", pollId)
    .eq("match_id", matchId)
    .eq("umpire_id", umpireId)
    .eq("organization_id", tenantId);

  if (error) throw new Error(error.message);
  revalidatePath(`/protected/polls/${pollId}`);
}

export async function getUmpiresForPoll(
  pollId: string,
): Promise<RosteredUmpire[]> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data: responses, error: respError } = await supabase
    .from("availability_responses")
    .select("umpire_id")
    .eq("poll_id", pollId)
    .not("umpire_id", "is", null);

  if (respError) throw new Error(respError.message);

  const umpireIds = [
    ...new Set(
      (responses ?? [])
        .map((r: { umpire_id: string | null }) => r.umpire_id)
        .filter((id): id is string => id !== null),
    ),
  ];

  if (umpireIds.length === 0) return [];

  const { data: umpires, error } = await supabase
    .from("umpires")
    .select("*")
    .in("id", umpireIds)
    .order("name");

  if (error) throw new Error(error.message);

  // The planner note lives on the roster row, not on the shared umpire record,
  // so it is fetched per organization and merged in here.
  const { data: roster, error: rosterError } = await supabase
    .from("organization_umpires")
    .select("umpire_id, notes")
    .eq("organization_id", tenantId)
    .in("umpire_id", umpireIds);

  if (rosterError) throw new Error(rosterError.message);

  const notesById = new Map<string, string | null>(
    (roster ?? []).map((r) => [r.umpire_id, r.notes ?? null]),
  );

  return (umpires ?? []).map((umpire: Umpire) => ({
    ...umpire,
    notes: notesById.get(umpire.id) ?? null,
  }));
}
