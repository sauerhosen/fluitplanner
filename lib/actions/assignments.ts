"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import type { Assignment, Umpire } from "@/lib/types/domain";
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
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/protected/polls/${pollId}`);
  return data;
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

export async function getUmpiresForPoll(pollId: string): Promise<Umpire[]> {
  const { supabase } = await requireAuth();

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
  return umpires ?? [];
}
