"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import { requirePlanner } from "@/lib/auth";
import { normalizeNote } from "@/lib/domain/notes";
import type { RosteredUmpire, Umpire } from "@/lib/types/domain";

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

export type UmpireFilters = {
  search?: string;
  level?: 1 | 2 | 3;
};

export async function getUmpires(
  filters?: UmpireFilters,
): Promise<RosteredUmpire[]> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { data: roster, error: rosterError } = await supabase
    .from("organization_umpires")
    .select("umpire_id, notes")
    .eq("organization_id", tenantId);

  if (rosterError) throw new Error(rosterError.message);
  if (!roster || roster.length === 0) return [];

  const umpireIds = roster.map((r) => r.umpire_id);
  const notesById = new Map<string, string | null>(
    roster.map((r) => [r.umpire_id, r.notes ?? null]),
  );

  let query = supabase
    .from("umpires")
    .select("*")
    .in("id", umpireIds)
    .order("name");

  if (filters?.level) {
    query = query.eq("level", filters.level);
  }
  if (filters?.search) {
    const sanitized = filters.search.replace(/[%_,().]/g, "");
    if (sanitized) {
      query = query.or(`name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`);
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((umpire: Umpire) => ({
    ...umpire,
    notes: notesById.get(umpire.id) ?? null,
  }));
}

/**
 * Write this organization's note about an umpire onto its roster row.
 *
 * Scoped by `organization_id`, so a planner can only ever touch the note their
 * own organization keeps — the umpire row itself is shared between orgs.
 */
async function writeUmpireNote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  umpireId: string,
  notes: string | null,
): Promise<void> {
  const { data, error } = await supabase
    .from("organization_umpires")
    .update({ notes: normalizeNote(notes) })
    .eq("organization_id", tenantId)
    .eq("umpire_id", umpireId)
    .select("umpire_id");

  if (error) throw new Error(error.message);
  // No matching roster row means the umpire is not on this organization's
  // roster; without this the write would be a silent no-op.
  if (!data || data.length === 0)
    throw new Error("Umpire not in this organization");
}

export async function createUmpire(umpire: {
  name: string;
  email: string;
  level?: 1 | 2 | 3;
  notes?: string | null;
}): Promise<RosteredUmpire> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();
  const normalizedEmail = umpire.email.trim().toLowerCase();
  // Validate before any write, so an over-long note fails the whole call
  // rather than leaving a rostered umpire behind without their note.
  const notes = umpire.notes === undefined ? null : normalizeNote(umpire.notes);

  // Check if umpire already exists by email
  const { data: existing } = await supabase
    .from("umpires")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle();

  let umpireRecord: Umpire;

  if (existing) {
    umpireRecord = existing;
  } else {
    const { data, error } = await supabase
      .from("umpires")
      .insert({
        name: umpire.name.trim(),
        email: normalizedEmail,
        level: umpire.level ?? 1,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    umpireRecord = data;
  }

  // Link umpire to current organization
  const { error: linkError } = await supabase
    .from("organization_umpires")
    .upsert(
      { organization_id: tenantId, umpire_id: umpireRecord.id },
      { onConflict: "organization_id,umpire_id" },
    );

  if (linkError) throw new Error(linkError.message);

  // Written separately from the link upsert so re-adding an umpire who is
  // already on the roster cannot blank the note they already carry.
  if (notes !== null) {
    await writeUmpireNote(supabase, tenantId, umpireRecord.id, notes);
    return { ...umpireRecord, notes };
  }

  // No note was written, so the roster may already hold one from an earlier
  // stint. Read it back rather than claiming the umpire has none.
  const { data: rosterEntry, error: rosterError } = await supabase
    .from("organization_umpires")
    .select("notes")
    .eq("organization_id", tenantId)
    .eq("umpire_id", umpireRecord.id)
    .maybeSingle();

  if (rosterError) throw new Error(rosterError.message);

  return { ...umpireRecord, notes: rosterEntry?.notes ?? null };
}

export async function updateUmpire(
  id: string,
  updates: Partial<{
    name: string;
    email: string;
    level: 1 | 2 | 3;
    notes: string | null;
  }>,
): Promise<RosteredUmpire> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // Verify the umpire belongs to the current org's roster
  const { data: rosterEntry } = await supabase
    .from("organization_umpires")
    .select("umpire_id, notes")
    .eq("organization_id", tenantId)
    .eq("umpire_id", id)
    .maybeSingle();

  if (!rosterEntry) throw new Error("Umpire not in this organization");

  const cleanUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) cleanUpdates.name = updates.name.trim();
  if (updates.email !== undefined)
    cleanUpdates.email = updates.email.trim().toLowerCase();
  if (updates.level !== undefined) cleanUpdates.level = updates.level;

  // Validated up front, so an over-long note fails the call before anything
  // is written. The note lives on the roster row, so it is written separately
  // from the shared umpire record — and only when the caller actually sent one.
  const notes: string | null =
    updates.notes === undefined
      ? (rosterEntry.notes ?? null)
      : normalizeNote(updates.notes);

  let record: Umpire;
  if (Object.keys(cleanUpdates).length === 0) {
    const { data, error } = await supabase
      .from("umpires")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw new Error(error.message);
    record = data;
  } else {
    const { data, error } = await supabase
      .from("umpires")
      .update(cleanUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    record = data;
  }

  // Written last, and only once the umpire record is safely saved: the two
  // tables cannot be updated in one transaction, and the shared row carries
  // the likelier failure (the unique email constraint). A save the planner
  // saw fail must not leave the new note behind.
  if (updates.notes !== undefined) {
    await writeUmpireNote(supabase, tenantId, id, notes);
  }

  return { ...record, notes };
}

/**
 * Set or clear this organization's note on an umpire.
 *
 * A blank body clears the note (stored as NULL) rather than an empty string,
 * so "has a note" stays a single check everywhere it is rendered.
 */
export async function updateUmpireNotes(
  id: string,
  notes: string,
): Promise<void> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  await writeUmpireNote(supabase, tenantId, id, notes);
}

export async function deleteUmpire(id: string): Promise<void> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // Remove umpire from this organization's roster (not from the umpires table)
  const { error } = await supabase
    .from("organization_umpires")
    .delete()
    .eq("organization_id", tenantId)
    .eq("umpire_id", id);

  if (error) throw new Error(error.message);
}

export async function deleteUmpires(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  if (ids.length > 500)
    throw new Error("Cannot delete more than 500 items at once");
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const { error } = await supabase
    .from("organization_umpires")
    .delete()
    .eq("organization_id", tenantId)
    .in("umpire_id", ids);

  if (error) throw new Error(error.message);
  revalidatePath("/protected/umpires");
}

/**
 * What a merge carried over, and what it had to discard as a conflict.
 *
 * "Dropped" rows are the losing half of a cell both umpires answered: one
 * person cannot hold two answers for the same poll slot or two appointments
 * for the same match.
 */
export type UmpireMergeSummary = {
  responsesMoved: number;
  responsesDropped: number;
  assignmentsMoved: number;
  assignmentsDropped: number;
};

/** How much the umpire about to disappear is carrying, for the confirm step. */
export type UmpireMergePreview = {
  responses: number;
  assignments: number;
};

export async function getUmpireMergePreview(
  disappearingId: string,
): Promise<UmpireMergePreview> {
  const { supabase, tenantId } = await requirePlanner();

  // The counts are read past RLS on shared tables, so the roster check the
  // merge itself makes has to be made here too: without it any umpire id in
  // the system can be counted from outside the organization that holds them.
  const { data: rosterEntry, error: rosterError } = await supabase
    .from("organization_umpires")
    .select("umpire_id")
    .eq("organization_id", tenantId)
    .eq("umpire_id", disappearingId)
    .maybeSingle();

  if (rosterError) throw new Error(rosterError.message);
  if (!rosterEntry) throw new Error("Umpire not in this organization");

  const [responses, assignments] = await Promise.all([
    supabase
      .from("availability_responses")
      .select("id", { count: "exact", head: true })
      .eq("umpire_id", disappearingId),
    supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .eq("umpire_id", disappearingId),
  ]);

  if (responses.error) throw new Error(responses.error.message);
  if (assignments.error) throw new Error(assignments.error.message);

  return {
    responses: responses.count ?? 0,
    assignments: assignments.count ?? 0,
  };
}

/**
 * Fold a duplicate umpire into the record that survives.
 *
 * One mistyped email on a poll is enough to create a second person: the address
 * is the identity everywhere. This moves everything the duplicate collected —
 * availability, appointments, roster notes, the verified login link — onto the
 * surviving record and deletes the duplicate.
 *
 * The work happens inside `merge_umpires` (see the migration) rather than as a
 * series of calls from here: it rewrites five tables and deletes rows, and a
 * merge that failed halfway would strand availability on an umpire that no
 * longer exists. The function re-checks the planner role and both rosters for
 * itself, because SECURITY DEFINER means RLS is not there to do it.
 */
export async function mergeUmpires(
  survivingId: string,
  disappearingId: string,
): Promise<UmpireMergeSummary> {
  if (survivingId === disappearingId)
    throw new Error("Cannot merge an umpire into themselves");

  const { supabase, tenantId } = await requirePlanner();

  const { data, error } = await supabase.rpc("merge_umpires", {
    p_surviving_id: survivingId,
    p_disappearing_id: disappearingId,
    p_organization_id: tenantId,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/protected/umpires");

  const summary = (data ?? {}) as Record<string, number>;
  return {
    responsesMoved: summary.responses_moved ?? 0,
    responsesDropped: summary.responses_dropped ?? 0,
    assignmentsMoved: summary.assignments_moved ?? 0,
    assignmentsDropped: summary.assignments_dropped ?? 0,
  };
}
