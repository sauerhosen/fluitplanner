import { nanoid } from "nanoid";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { mapMatchesToSlots } from "@/lib/domain/match-slot-mapping";
import { groupMatchesIntoSlots } from "@/lib/domain/slots";
import { normalizeNote, MAX_NOTE_LENGTH } from "@/lib/domain/notes";
import { composeAmsterdamTimestamp } from "@/lib/domain/timezone";
import type {
  Assignment,
  Match,
  Poll,
  PollSlot,
  RosteredUmpire,
} from "@/lib/types/domain";
import type { McpPlannerContext } from "@/lib/mcp/auth";
import {
  assessCandidates,
  assessSlotRisk,
  availabilityKey,
  checkAssignmentSet,
  summarizeGap,
  type AssignmentIssue,
  type AvailabilityAnswer,
  type ProposedAssignment,
  type UmpireWorkload,
} from "@/lib/mcp/planning";

/**
 * Data access for the MCP tools. The MCP request carries a token, not a
 * session, so the cookie/header-based server actions don't apply here: every
 * query runs on the service client with an explicit organization_id filter —
 * the same belt-and-braces the server actions use on top of RLS.
 */

/** Errors whose message is safe and useful to show to the MCP client. */
export class McpUserError extends Error {}

type Db = SupabaseClient;

function db(): Db {
  return createServiceClient();
}

function throwDb(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/**
 * PostgREST sends filters in the query string, so a long `.in()` id list
 * blows past URL length limits (~300 uuids is already too many). Run such
 * lookups in batches and concatenate.
 */
const IN_BATCH_SIZE = 100;

function batches<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += IN_BATCH_SIZE) {
    out.push(items.slice(i, i + IN_BATCH_SIZE));
  }
  return out;
}

async function selectInBatches<Row>(
  ids: string[],
  query: (batch: string[]) => PromiseLike<{
    data: Row[] | null;
    error: { message: string } | null;
  }>,
): Promise<Row[]> {
  const rows: Row[] = [];
  for (const batch of batches(ids)) {
    const { data, error } = await query(batch);
    throwDb(error);
    rows.push(...(data ?? []));
  }
  return rows;
}

const TIME_ZONE = "Europe/Amsterdam";
const localFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  dateStyle: "short",
  timeStyle: "short",
});

/** "2026-03-15 11:00" in the club's timezone, for ISO timestamps. */
function local(iso: string | null): string | null {
  return iso ? localFormat.format(new Date(iso)) : null;
}

const localDateFormat = new Intl.DateTimeFormat("sv-SE", {
  timeZone: TIME_ZONE,
  dateStyle: "short",
});

/** Today's calendar date in the club's timezone (the server may run UTC). */
function today(): string {
  return localDateFormat.format(new Date());
}

function daysFromToday(days: number): string {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Shared lookups
// ---------------------------------------------------------------------------

async function getRoster(client: Db, orgId: string): Promise<RosteredUmpire[]> {
  const { data, error } = await client
    .from("organization_umpires")
    .select(
      "notes, umpires (id, auth_user_id, name, email, level, created_at, updated_at)",
    )
    .eq("organization_id", orgId);
  throwDb(error);
  return (data ?? [])
    .flatMap((row) => {
      const umpire = row.umpires as unknown as RosteredUmpire | null;
      return umpire
        ? [{ ...umpire, notes: (row.notes as string | null) ?? null }]
        : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getPollScoped(
  client: Db,
  ctx: McpPlannerContext,
  pollId: string,
): Promise<Poll> {
  const { data, error } = await client
    .from("polls")
    .select("*")
    .eq("id", pollId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  throwDb(error);
  if (!data) {
    throw new McpUserError(
      `Poll ${pollId} not found in this club. Use list_polls to find valid poll ids.`,
    );
  }
  return data as Poll;
}

async function getOrgAssignments(
  client: Db,
  orgId: string,
): Promise<Assignment[]> {
  const { data, error } = await client
    .from("assignments")
    .select("*")
    .eq("organization_id", orgId);
  throwDb(error);
  return (data ?? []) as Assignment[];
}

async function getOrgMatchesById(
  client: Db,
  orgId: string,
): Promise<Map<string, Match>> {
  const { data, error } = await client
    .from("matches")
    .select("*")
    .eq("organization_id", orgId);
  throwDb(error);
  return new Map(((data ?? []) as Match[]).map((m) => [m.id, m]));
}

async function getWorkloads(
  client: Db,
  orgId: string,
): Promise<Map<string, UmpireWorkload>> {
  const [assignments, matchesById] = await Promise.all([
    getOrgAssignments(client, orgId),
    getOrgMatchesById(client, orgId),
  ]);
  const todayStr = today();
  const result = new Map<string, UmpireWorkload>();
  for (const a of assignments) {
    const w = result.get(a.umpire_id) ?? {
      confirmed: 0,
      tentative: 0,
      upcoming_confirmed: 0,
      last_confirmed_date: null,
    };
    const date = matchesById.get(a.match_id)?.date ?? null;
    if (a.status === "confirmed") {
      w.confirmed++;
      if (date) {
        if (date >= todayStr) w.upcoming_confirmed++;
        if (
          date <= todayStr &&
          (!w.last_confirmed_date || date > w.last_confirmed_date)
        ) {
          w.last_confirmed_date = date;
        }
      }
    } else {
      w.tentative++;
    }
    result.set(a.umpire_id, w);
  }
  return result;
}

type PollGraph = {
  poll: Poll;
  slots: PollSlot[];
  matches: Match[];
  /** matchId -> slotId, for matches with a start time inside a slot. */
  slotByMatch: Map<string, string>;
  /** slotId -> (umpireId -> answer) */
  responsesBySlot: Map<string, Map<string, "yes" | "if_need_be" | "no">>;
  /** Distinct umpire ids that answered anything in this poll. */
  respondents: Set<string>;
};

async function getPollGraph(
  client: Db,
  ctx: McpPlannerContext,
  pollId: string,
): Promise<PollGraph> {
  const poll = await getPollScoped(client, ctx, pollId);

  const [slotsRes, pollMatchesRes, responsesRes] = await Promise.all([
    client
      .from("poll_slots")
      .select("*")
      .eq("poll_id", pollId)
      .order("start_time"),
    client.from("poll_matches").select("match_id").eq("poll_id", pollId),
    client
      .from("availability_responses")
      .select("slot_id, umpire_id, response")
      .eq("poll_id", pollId),
  ]);
  throwDb(slotsRes.error);
  throwDb(pollMatchesRes.error);
  throwDb(responsesRes.error);

  const matchIds = (pollMatchesRes.data ?? []).map((r) => r.match_id as string);
  const matches = (
    await selectInBatches<Match>(matchIds, (batch) =>
      client
        .from("matches")
        .select("*")
        .in("id", batch)
        .eq("organization_id", ctx.organizationId),
    )
  ).sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.start_time ?? "").localeCompare(b.start_time ?? ""),
  );

  const slots = (slotsRes.data ?? []) as PollSlot[];
  const responsesBySlot = new Map<
    string,
    Map<string, "yes" | "if_need_be" | "no">
  >();
  const respondents = new Set<string>();
  for (const r of responsesRes.data ?? []) {
    if (!r.umpire_id) continue;
    respondents.add(r.umpire_id as string);
    const perSlot = responsesBySlot.get(r.slot_id as string) ?? new Map();
    perSlot.set(
      r.umpire_id as string,
      r.response as "yes" | "if_need_be" | "no",
    );
    responsesBySlot.set(r.slot_id as string, perSlot);
  }

  return {
    poll,
    slots,
    matches,
    slotByMatch: mapMatchesToSlots(matches, slots),
    responsesBySlot,
    respondents,
  };
}

/** Answer per availabilityKey(match, umpire) for every match/roster pair. */
function buildAvailabilityMap(
  graph: PollGraph,
  roster: RosteredUmpire[],
): Map<string, AvailabilityAnswer> {
  const map = new Map<string, AvailabilityAnswer>();
  for (const match of graph.matches) {
    const slotId = graph.slotByMatch.get(match.id);
    if (!slotId) continue; // no slot -> availability unknowable, not "silent"
    const perSlot = graph.responsesBySlot.get(slotId);
    for (const umpire of roster) {
      map.set(
        availabilityKey(match.id, umpire.id),
        perSlot?.get(umpire.id) ?? "no_response",
      );
    }
  }
  return map;
}

function matchLabel(m: Match): string {
  return `${m.home_team} – ${m.away_team}`;
}

function matchSummary(m: Match) {
  return {
    id: m.id,
    date: m.date,
    start_time: m.start_time,
    local_time: local(m.start_time),
    home_team: m.home_team,
    away_team: m.away_team,
    venue: m.venue,
    field: m.field,
    competition: m.competition,
    required_level: m.required_level,
    cancelled_upstream: m.cancelled_upstream || undefined,
    needs_review: m.needs_review || undefined,
  };
}

// ---------------------------------------------------------------------------
// M1 — caller and club context
// ---------------------------------------------------------------------------

export async function getContext(ctx: McpPlannerContext) {
  const client = db();
  const [membershipsRes, rosterCount, openPolls, upcoming, settingsRes] =
    await Promise.all([
      client
        .from("organization_members")
        .select("role, organizations (id, name, slug, is_active)")
        .eq("user_id", ctx.userId),
      client
        .from("organization_umpires")
        .select("umpire_id", { count: "exact", head: true })
        .eq("organization_id", ctx.organizationId),
      client
        .from("polls")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ctx.organizationId)
        .eq("status", "open"),
      client
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", ctx.organizationId)
        .gte("date", today())
        .lte("date", daysFromToday(14)),
      client
        .from("organization_settings")
        .select("availability_lock_mode")
        .eq("organization_id", ctx.organizationId)
        .maybeSingle(),
    ]);
  throwDb(membershipsRes.error);
  throwDb(rosterCount.error);
  throwDb(openPolls.error);
  throwDb(upcoming.error);
  throwDb(settingsRes.error);

  const memberships = (membershipsRes.data ?? []).flatMap((row) => {
    const org = row.organizations as unknown as {
      id: string;
      name: string;
      slug: string;
      is_active: boolean;
    } | null;
    if (!org || !org.is_active) return [];
    return [{ club: org.name, slug: org.slug, role: row.role as string }];
  });

  return {
    club: {
      id: ctx.organizationId,
      name: ctx.organizationName,
      slug: ctx.organizationSlug,
    },
    role: "planner",
    scope:
      "This connection is scoped to this club only. Data from other clubs is not accessible through this token.",
    all_memberships: memberships,
    availability_lock_mode: settingsRes.data?.availability_lock_mode ?? "warn",
    roster_size: rosterCount.count ?? 0,
    open_polls: openPolls.count ?? 0,
    matches_next_14_days: upcoming.count ?? 0,
    today: today(),
    timezone: TIME_ZONE,
  };
}

// ---------------------------------------------------------------------------
// M2 + M6 — matches with fill state
// ---------------------------------------------------------------------------

export type MatchListFilters = {
  date_from?: string;
  date_to?: string;
  team?: string;
  competition?: string;
  required_level?: 1 | 2 | 3;
  needs_review?: boolean;
  include_cancelled?: boolean;
  fill?: "empty" | "partial" | "full";
  unpolled?: boolean;
  poll_id?: string;
  limit?: number;
};

export async function listMatches(
  ctx: McpPlannerContext,
  filters: MatchListFilters,
) {
  const client = db();
  let query = client
    .from("matches")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("date")
    .order("start_time");

  if (filters.date_from) query = query.gte("date", filters.date_from);
  if (filters.date_to) query = query.lte("date", filters.date_to);
  if (filters.required_level)
    query = query.eq("required_level", filters.required_level);
  if (filters.needs_review !== undefined)
    query = query.eq("needs_review", filters.needs_review);
  if (!filters.include_cancelled) query = query.eq("cancelled_upstream", false);
  if (filters.team) {
    const term = filters.team.replace(/[,()%]/g, " ").trim();
    query = query.or(`home_team.ilike.%${term}%,away_team.ilike.%${term}%`);
  }
  if (filters.competition) {
    query = query.ilike(
      "competition",
      `%${filters.competition.replace(/[,()%]/g, " ").trim()}%`,
    );
  }

  const { data, error } = await query;
  throwDb(error);
  let matches = (data ?? []) as Match[];

  const matchIds = matches.map((m) => m.id);
  const [pollLinkRows, assignmentRows, roster] = await Promise.all([
    selectInBatches<{ poll_id: string; match_id: string }>(matchIds, (batch) =>
      client
        .from("poll_matches")
        .select("poll_id, match_id")
        .in("match_id", batch),
    ),
    selectInBatches<{ match_id: string; umpire_id: string; status: string }>(
      matchIds,
      (batch) =>
        client
          .from("assignments")
          .select("match_id, umpire_id, status")
          .eq("organization_id", ctx.organizationId)
          .in("match_id", batch),
    ),
    getRoster(client, ctx.organizationId),
  ]);

  const nameById = new Map(roster.map((u) => [u.id, u.name]));
  const pollsByMatch = new Map<string, string[]>();
  for (const link of pollLinkRows) {
    const list = pollsByMatch.get(link.match_id) ?? [];
    list.push(link.poll_id);
    pollsByMatch.set(link.match_id, list);
  }
  const assignedByMatch = new Map<
    string,
    { umpire_id: string; name: string; status: string }[]
  >();
  for (const a of assignmentRows) {
    const list = assignedByMatch.get(a.match_id) ?? [];
    list.push({
      umpire_id: a.umpire_id,
      name: nameById.get(a.umpire_id) ?? a.umpire_id,
      status: a.status,
    });
    assignedByMatch.set(a.match_id, list);
  }

  if (filters.poll_id) {
    matches = matches.filter((m) =>
      (pollsByMatch.get(m.id) ?? []).includes(filters.poll_id!),
    );
  }
  if (filters.unpolled) {
    matches = matches.filter((m) => !(pollsByMatch.get(m.id) ?? []).length);
  }

  const rows = matches.map((m) => {
    const assigned = assignedByMatch.get(m.id) ?? [];
    const confirmed = assigned.filter((a) => a.status === "confirmed");
    const fill: "empty" | "partial" | "full" =
      confirmed.length >= 2
        ? "full"
        : confirmed.length === 1
          ? "partial"
          : "empty";
    return {
      ...matchSummary(m),
      notes: m.notes,
      source: m.source,
      review_reasons: m.needs_review ? m.review_reasons : undefined,
      poll_ids: pollsByMatch.get(m.id) ?? [],
      fill,
      confirmed_umpires: confirmed.map(({ umpire_id, name }) => ({
        umpire_id,
        name,
      })),
      tentative_umpires: assigned
        .filter((a) => a.status === "tentative")
        .map(({ umpire_id, name }) => ({ umpire_id, name })),
    };
  });

  const filtered = filters.fill
    ? rows.filter((r) => r.fill === filters.fill)
    : rows;
  const limit = Math.min(filters.limit ?? 200, 500);
  return {
    total: filtered.length,
    truncated: filtered.length > limit ? true : undefined,
    matches: filtered.slice(0, limit),
  };
}

// ---------------------------------------------------------------------------
// M3 — roster
// ---------------------------------------------------------------------------

export async function listUmpires(ctx: McpPlannerContext) {
  const client = db();
  const [roster, workloads] = await Promise.all([
    getRoster(client, ctx.organizationId),
    getWorkloads(client, ctx.organizationId),
  ]);
  return {
    total: roster.length,
    umpires: roster.map((u) => ({
      id: u.id,
      name: u.name,
      level: u.level,
      notes: u.notes,
      workload: workloads.get(u.id),
    })),
  };
}

// ---------------------------------------------------------------------------
// M4 — polls
// ---------------------------------------------------------------------------

export async function listPolls(ctx: McpPlannerContext) {
  const client = db();
  const { data, error } = await client
    .from("polls")
    .select("id, title, status, created_at")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false });
  throwDb(error);
  const polls = data ?? [];
  const pollIds = polls.map((p) => p.id as string);
  if (pollIds.length === 0) return { polls: [] };

  const [links, slots, responses, rosterCount] = await Promise.all([
    client
      .from("poll_matches")
      .select("poll_id, match_id")
      .in("poll_id", pollIds),
    client
      .from("poll_slots")
      .select("poll_id, start_time, end_time")
      .in("poll_id", pollIds),
    client
      .from("availability_responses")
      .select("poll_id, umpire_id")
      .in("poll_id", pollIds),
    client
      .from("organization_umpires")
      .select("umpire_id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId),
  ]);
  throwDb(links.error);
  throwDb(slots.error);
  throwDb(responses.error);
  throwDb(rosterCount.error);

  const matchCount = new Map<string, number>();
  for (const l of links.data ?? []) {
    matchCount.set(l.poll_id, (matchCount.get(l.poll_id) ?? 0) + 1);
  }
  const period = new Map<string, { from: string; to: string }>();
  for (const s of slots.data ?? []) {
    const p = period.get(s.poll_id);
    period.set(s.poll_id, {
      from: !p || s.start_time < p.from ? s.start_time : p.from,
      to: !p || s.end_time > p.to ? s.end_time : p.to,
    });
  }
  const respondents = new Map<string, Set<string>>();
  for (const r of responses.data ?? []) {
    if (!r.umpire_id) continue;
    const set = respondents.get(r.poll_id) ?? new Set();
    set.add(r.umpire_id);
    respondents.set(r.poll_id, set);
  }

  return {
    roster_size: rosterCount.count ?? 0,
    polls: polls.map((p) => {
      const range = period.get(p.id as string);
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        created_at: p.created_at,
        match_count: matchCount.get(p.id as string) ?? 0,
        period_from: range ? local(range.from) : null,
        period_to: range ? local(range.to) : null,
        respondents: respondents.get(p.id as string)?.size ?? 0,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// M5 + M12 — availability, the silence, and slot risk
// ---------------------------------------------------------------------------

export async function getPollAvailability(
  ctx: McpPlannerContext,
  pollId: string,
) {
  const client = db();
  const [graph, roster] = await Promise.all([
    getPollGraph(client, ctx, pollId),
    getRoster(client, ctx.organizationId),
  ]);

  const matchCountBySlot = new Map<string, number>();
  for (const slotId of graph.slotByMatch.values()) {
    matchCountBySlot.set(slotId, (matchCountBySlot.get(slotId) ?? 0) + 1);
  }

  const nameById = new Map(roster.map((u) => [u.id, u.name]));
  const slotRows = graph.slots.map((slot) => {
    const perSlot = graph.responsesBySlot.get(slot.id) ?? new Map();
    const bucket = (answer: "yes" | "if_need_be" | "no") =>
      [...perSlot.entries()]
        .filter(([, a]) => a === answer)
        .map(([umpireId]) => ({
          umpire_id: umpireId,
          name: nameById.get(umpireId) ?? umpireId,
        }));
    return {
      slot_id: slot.id,
      start: local(slot.start_time),
      end: local(slot.end_time),
      matches: graph.matches
        .filter((m) => graph.slotByMatch.get(m.id) === slot.id)
        .map((m) => ({ id: m.id, label: matchLabel(m) })),
      yes: bucket("yes"),
      if_need_be: bucket("if_need_be"),
      no: bucket("no"),
    };
  });

  const nonResponders = roster
    .filter((u) => !graph.respondents.has(u.id))
    .map((u) => ({ umpire_id: u.id, name: u.name, level: u.level }));

  const risk = assessSlotRisk({
    slots: graph.slots,
    matchCountBySlot,
    responsesBySlot: graph.responsesBySlot,
    rosterSize: roster.length,
  }).map((r) => ({
    ...r,
    start_time: local(r.start_time),
    end_time: local(r.end_time),
  }));

  return {
    poll: {
      id: graph.poll.id,
      title: graph.poll.title,
      status: graph.poll.status,
    },
    roster_size: roster.length,
    respondents: graph.respondents.size,
    non_responders: nonResponders,
    slots: slotRows,
    slot_risk: risk,
    matches_without_slot: graph.matches
      .filter((m) => !graph.slotByMatch.get(m.id))
      .map((m) => ({
        id: m.id,
        label: matchLabel(m),
        start_time: m.start_time,
      })),
  };
}

// ---------------------------------------------------------------------------
// M6 — assignment state for a poll
// ---------------------------------------------------------------------------

export async function getAssignments(ctx: McpPlannerContext, pollId: string) {
  const client = db();
  const [graph, roster, assignmentsRes] = await Promise.all([
    getPollGraph(client, ctx, pollId),
    getRoster(client, ctx.organizationId),
    client
      .from("assignments")
      .select("match_id, umpire_id, status")
      .eq("poll_id", pollId)
      .eq("organization_id", ctx.organizationId),
  ]);
  throwDb(assignmentsRes.error);

  const rosterById = new Map(roster.map((u) => [u.id, u]));
  const byMatch = new Map<
    string,
    { umpire_id: string; name: string; level: number | null; status: string }[]
  >();
  for (const a of assignmentsRes.data ?? []) {
    const list = byMatch.get(a.match_id) ?? [];
    const umpire = rosterById.get(a.umpire_id);
    list.push({
      umpire_id: a.umpire_id,
      name: umpire?.name ?? a.umpire_id,
      level: umpire?.level ?? null,
      status: a.status,
    });
    byMatch.set(a.match_id, list);
  }

  const matches = graph.matches.map((m) => {
    const assigned = byMatch.get(m.id) ?? [];
    const confirmed = assigned.filter((a) => a.status === "confirmed").length;
    return {
      ...matchSummary(m),
      assigned,
      confirmed_count: confirmed,
      missing_confirmed: Math.max(0, 2 - confirmed),
    };
  });

  return {
    poll: {
      id: graph.poll.id,
      title: graph.poll.title,
      status: graph.poll.status,
    },
    matches,
    totals: {
      matches: matches.length,
      fully_confirmed: matches.filter((m) => m.missing_confirmed === 0).length,
      with_tentative: matches.filter((m) =>
        m.assigned.some((a) => a.status === "tentative"),
      ).length,
      empty: matches.filter((m) => m.assigned.length === 0).length,
    },
  };
}

// ---------------------------------------------------------------------------
// M9 — workload
// ---------------------------------------------------------------------------

export async function getUmpireWorkloads(ctx: McpPlannerContext) {
  const client = db();
  const [roster, workloads] = await Promise.all([
    getRoster(client, ctx.organizationId),
    getWorkloads(client, ctx.organizationId),
  ]);
  return {
    umpires: roster
      .map((u) => ({
        umpire_id: u.id,
        name: u.name,
        level: u.level,
        ...(workloads.get(u.id) ?? {
          confirmed: 0,
          tentative: 0,
          upcoming_confirmed: 0,
          last_confirmed_date: null,
        }),
      }))
      .sort((a, b) => b.confirmed - a.confirmed),
  };
}

// ---------------------------------------------------------------------------
// M7 — candidate search
// ---------------------------------------------------------------------------

export async function findCandidatesForMatch(
  ctx: McpPlannerContext,
  matchId: string,
) {
  const client = db();
  const { data: matchRow, error } = await client
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  throwDb(error);
  if (!matchRow) {
    throw new McpUserError(
      `Match ${matchId} not found in this club. Use list_matches to find valid match ids.`,
    );
  }
  const match = matchRow as Match;

  // Which poll carries this match's availability? Prefer an open poll.
  const { data: links, error: linkError } = await client
    .from("poll_matches")
    .select("poll_id, polls!inner (id, status, organization_id)")
    .eq("match_id", matchId)
    .eq("polls.organization_id", ctx.organizationId);
  throwDb(linkError);
  const pollRows = (links ?? []).map(
    (l) => l.polls as unknown as { id: string; status: string },
  );
  const poll = pollRows.find((p) => p.status === "open") ?? pollRows[0] ?? null;

  let slotResponses = new Map<string, "yes" | "if_need_be" | "no">();
  let slotInfo: {
    slot_id: string;
    start: string | null;
    end: string | null;
  } | null = null;
  if (poll) {
    const graph = await getPollGraph(client, ctx, poll.id);
    const slotId = graph.slotByMatch.get(matchId);
    if (slotId) {
      slotResponses = graph.responsesBySlot.get(slotId) ?? new Map();
      const slot = graph.slots.find((s) => s.id === slotId)!;
      slotInfo = {
        slot_id: slotId,
        start: local(slot.start_time),
        end: local(slot.end_time),
      };
    }
  }

  const [roster, assignments, matchesById, workloads] = await Promise.all([
    getRoster(client, ctx.organizationId),
    getOrgAssignments(client, ctx.organizationId),
    getOrgMatchesById(client, ctx.organizationId),
    getWorkloads(client, ctx.organizationId),
  ]);

  const candidates = assessCandidates({
    match,
    roster,
    slotResponses,
    assignments,
    matchesById,
    workloadByUmpire: workloads,
  });

  return {
    match: matchSummary(match),
    poll: poll ? { id: poll.id, status: poll.status } : null,
    slot: slotInfo,
    availability_note: !poll
      ? "This match is not in any poll, so no availability was collected — every umpire shows as no_response."
      : !slotInfo
        ? "The match has no time slot in its poll (missing start time?), so availability is unknown."
        : undefined,
    candidates,
  };
}

// ---------------------------------------------------------------------------
// M8 — conflict & eligibility check
// ---------------------------------------------------------------------------

async function runPollCheck(
  client: Db,
  ctx: McpPlannerContext,
  pollId: string,
  proposed: ProposedAssignment[],
  /** Assignment row ids about to be replaced — checked as if already gone. */
  excludeAssignmentIds?: Set<string>,
): Promise<{ issues: AssignmentIssue[]; graph: PollGraph }> {
  const graph = await getPollGraph(client, ctx, pollId);
  const [roster, assignments, matchesById] = await Promise.all([
    getRoster(client, ctx.organizationId),
    getOrgAssignments(client, ctx.organizationId),
    getOrgMatchesById(client, ctx.organizationId),
  ]);
  const issues = checkAssignmentSet({
    pollId,
    pollMatchIds: new Set(graph.matches.map((m) => m.id)),
    rosterById: new Map(roster.map((u) => [u.id, u])),
    matchesById,
    existingAssignments: excludeAssignmentIds?.size
      ? assignments.filter((a) => !excludeAssignmentIds.has(a.id))
      : assignments,
    proposed,
    availabilityByMatchUmpire: buildAvailabilityMap(graph, roster),
  });
  return { issues, graph };
}

export async function checkPollAssignments(
  ctx: McpPlannerContext,
  pollId: string,
  proposed: ProposedAssignment[],
) {
  const { issues } = await runPollCheck(db(), ctx, pollId, proposed);
  return {
    checked: proposed.length
      ? `Proposal of ${proposed.length} assignment(s) plus the poll's existing assignments`
      : "The poll's existing assignments",
    errors: issues.filter((i) => i.severity === "error"),
    warnings: issues.filter((i) => i.severity === "warning"),
    ok: issues.length === 0,
  };
}

// ---------------------------------------------------------------------------
// M11 — write tentative assignments
// ---------------------------------------------------------------------------

export async function setTentativeAssignments(
  ctx: McpPlannerContext,
  pollId: string,
  proposed: ProposedAssignment[],
  replaceExistingTentative: boolean,
) {
  const client = db();
  const poll = await getPollScoped(client, ctx, pollId);

  // Replace mode never deletes up front: the check and insert run first, and
  // the superseded rows are removed last — so a failure anywhere leaves the
  // previous draft intact instead of destroying it with nothing written.
  const proposalKeys = new Set(
    proposed.map((p) => `${p.match_id}|${p.umpire_id}`),
  );
  let obsoleteTentative: { id: string }[] = [];
  if (replaceExistingTentative) {
    const { data, error } = await client
      .from("assignments")
      .select("id, match_id, umpire_id")
      .eq("poll_id", poll.id)
      .eq("organization_id", ctx.organizationId)
      .eq("status", "tentative");
    throwDb(error);
    // Re-proposed pairs keep their existing row; only the rest go.
    obsoleteTentative = (data ?? []).filter(
      (r) => !proposalKeys.has(`${r.match_id}|${r.umpire_id}`),
    );
  }

  const { issues } = await runPollCheck(
    client,
    ctx,
    pollId,
    proposed,
    new Set(obsoleteTentative.map((r) => r.id)),
  );

  // Structural errors and duplicate/already-assigned pairs are skipped;
  // warnings (level, availability, same-day) are written anyway — they are
  // the planner's call — and reported back.
  const blockedKeys = new Set(
    issues
      .filter(
        (i) =>
          (i.severity === "error" &&
            (i.code === "match_not_in_poll" ||
              i.code === "umpire_not_in_roster" ||
              i.code === "duplicate_in_proposal")) ||
          i.code === "already_assigned",
      )
      .map((i) => `${i.match_id ?? ""}|${i.umpire_id ?? ""}`),
  );
  const blockedMatches = new Set(
    issues.filter((i) => i.code === "match_not_in_poll").map((i) => i.match_id),
  );
  const blockedUmpires = new Set(
    issues
      .filter((i) => i.code === "umpire_not_in_roster")
      .map((i) => i.umpire_id),
  );

  // A hard double-booking is an error, not a planner-overridable warning:
  // the app's bulk-confirm promotes tentative rows without revalidation, so
  // an overlapping draft must never be written. Block the umpire's pair on
  // both matches of the clash.
  const doubleBookedKeys = new Set<string>();
  for (const i of issues) {
    if (i.code !== "double_booking" || !i.umpire_id) continue;
    if (i.match_id) doubleBookedKeys.add(`${i.match_id}|${i.umpire_id}`);
    if (i.conflicting_match_id) {
      doubleBookedKeys.add(`${i.conflicting_match_id}|${i.umpire_id}`);
    }
  }

  const seen = new Set<string>();
  const toInsert = proposed.filter((p) => {
    const key = `${p.match_id}|${p.umpire_id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return (
      !blockedKeys.has(key) &&
      !blockedMatches.has(p.match_id) &&
      !blockedUmpires.has(p.umpire_id) &&
      !doubleBookedKeys.has(key)
    );
  });

  if (toInsert.length > 0) {
    const { error } = await client.from("assignments").insert(
      toInsert.map((p) => ({
        poll_id: poll.id,
        match_id: p.match_id,
        umpire_id: p.umpire_id,
        organization_id: ctx.organizationId,
        status: "tentative",
      })),
    );
    throwDb(error);
  }

  if (obsoleteTentative.length > 0) {
    for (const batch of batches(obsoleteTentative.map((r) => r.id))) {
      const { error } = await client
        .from("assignments")
        .delete()
        .in("id", batch)
        .eq("organization_id", ctx.organizationId)
        .eq("status", "tentative");
      throwDb(error);
    }
  }

  return {
    created_tentative: toInsert.length,
    skipped: proposed.length - toInsert.length,
    cleared_previous_tentative: replaceExistingTentative
      ? obsoleteTentative.length
      : undefined,
    errors: issues.filter((i) => i.severity === "error"),
    warnings: issues.filter((i) => i.severity === "warning"),
    note: "These assignments are tentative drafts. The planner reviews and confirms them in the Fluitplanner app; nothing is visible to umpires until confirmed there.",
  };
}

export async function clearTentativeAssignments(
  ctx: McpPlannerContext,
  pollId: string,
) {
  const client = db();
  const poll = await getPollScoped(client, ctx, pollId);
  const { data, error } = await client
    .from("assignments")
    .delete()
    .eq("poll_id", poll.id)
    .eq("organization_id", ctx.organizationId)
    .eq("status", "tentative")
    .select("id");
  throwDb(error);
  return {
    deleted_tentative: (data ?? []).length,
    note: "Confirmed assignments were not touched.",
  };
}

// ---------------------------------------------------------------------------
// M13 — what needs attention
// ---------------------------------------------------------------------------

export async function getAttentionItems(ctx: McpPlannerContext) {
  const client = db();
  const todayStr = today();
  const weekLater = daysFromToday(7);

  const [openPollsRes, reviewRes, unpolledCandidatesRes, syncRes, rosterCount] =
    await Promise.all([
      client
        .from("polls")
        .select("id, title")
        .eq("organization_id", ctx.organizationId)
        .eq("status", "open"),
      client
        .from("matches")
        .select("id, date, start_time, home_team, away_team, review_reasons")
        .eq("organization_id", ctx.organizationId)
        .eq("needs_review", true)
        .order("date"),
      client
        .from("matches")
        .select("id, date, start_time, home_team, away_team")
        .eq("organization_id", ctx.organizationId)
        .eq("cancelled_upstream", false)
        .gte("date", todayStr)
        .lte("date", weekLater)
        .order("date"),
      client
        .from("hockey_sync_state")
        .select(
          "last_synced_at, last_sync_status, last_sync_error, awaiting_time_count",
        )
        .eq("organization_id", ctx.organizationId)
        .maybeSingle(),
      client
        .from("organization_umpires")
        .select("umpire_id", { count: "exact", head: true })
        .eq("organization_id", ctx.organizationId),
    ]);
  throwDb(openPollsRes.error);
  throwDb(reviewRes.error);
  throwDb(unpolledCandidatesRes.error);
  throwDb(syncRes.error);
  throwDb(rosterCount.error);
  const unpolledCandidateIds = (unpolledCandidatesRes.data ?? []).map(
    (m) => m.id as string,
  );

  const openPolls = openPollsRes.data ?? [];
  const pollIds = openPolls.map((p) => p.id as string);

  let unfilledByPoll: {
    poll_id: string;
    title: string | null;
    unfilled_matches: number;
  }[] = [];
  let lowResponsePolls: {
    poll_id: string;
    title: string | null;
    respondents: number;
    roster_size: number;
  }[] = [];
  const polledMatchIds = new Set<string>();

  if (pollIds.length > 0) {
    const [linksRes, assignsRes, responsesRes, allLinksRes] = await Promise.all(
      [
        client
          .from("poll_matches")
          .select("poll_id, match_id")
          .in("poll_id", pollIds),
        client
          .from("assignments")
          .select("match_id")
          .in("poll_id", pollIds)
          .eq("status", "confirmed"),
        client
          .from("availability_responses")
          .select("poll_id, umpire_id")
          .in("poll_id", pollIds),
        // Only the unpolled candidates' membership matters — bound the read.
        unpolledCandidateIds.length
          ? client
              .from("poll_matches")
              .select("match_id")
              .in("match_id", unpolledCandidateIds)
          : Promise.resolve({ data: [], error: null }),
      ],
    );
    throwDb(linksRes.error);
    throwDb(assignsRes.error);
    throwDb(responsesRes.error);
    throwDb(allLinksRes.error);

    for (const l of allLinksRes.data ?? []) polledMatchIds.add(l.match_id);

    const confirmedCount = new Map<string, number>();
    for (const a of assignsRes.data ?? []) {
      confirmedCount.set(a.match_id, (confirmedCount.get(a.match_id) ?? 0) + 1);
    }
    const unfilled = new Map<string, number>();
    for (const l of linksRes.data ?? []) {
      if ((confirmedCount.get(l.match_id) ?? 0) < 2) {
        unfilled.set(l.poll_id, (unfilled.get(l.poll_id) ?? 0) + 1);
      }
    }
    unfilledByPoll = openPolls
      .filter((p) => unfilled.has(p.id as string))
      .map((p) => ({
        poll_id: p.id as string,
        title: p.title as string | null,
        unfilled_matches: unfilled.get(p.id as string)!,
      }));

    const respondents = new Map<string, Set<string>>();
    for (const r of responsesRes.data ?? []) {
      if (!r.umpire_id) continue;
      const set = respondents.get(r.poll_id) ?? new Set();
      set.add(r.umpire_id);
      respondents.set(r.poll_id, set);
    }
    const rosterSize = rosterCount.count ?? 0;
    if (rosterSize > 0) {
      lowResponsePolls = openPolls
        .filter(
          (p) =>
            (respondents.get(p.id as string)?.size ?? 0) / rosterSize < 0.5,
        )
        .map((p) => ({
          poll_id: p.id as string,
          title: p.title as string | null,
          respondents: respondents.get(p.id as string)?.size ?? 0,
          roster_size: rosterSize,
        }));
    }
  } else if (unpolledCandidateIds.length > 0) {
    const { data: allLinks, error: allLinksError } = await client
      .from("poll_matches")
      .select("match_id")
      .in("match_id", unpolledCandidateIds);
    throwDb(allLinksError);
    for (const l of allLinks ?? []) polledMatchIds.add(l.match_id);
  }

  const unpolled = (unpolledCandidatesRes.data ?? []).filter(
    (m) => !polledMatchIds.has(m.id),
  );

  const sync = syncRes.data;
  return {
    unfilled_matches_in_open_polls: unfilledByPoll,
    low_response_open_polls: lowResponsePolls,
    unpolled_matches_next_7_days: unpolled.map((m) => ({
      id: m.id,
      date: m.date,
      local_time: local(m.start_time),
      label: `${m.home_team} – ${m.away_team}`,
    })),
    matches_flagged_after_sync: (reviewRes.data ?? []).map((m) => ({
      id: m.id,
      date: m.date,
      label: `${m.home_team} – ${m.away_team}`,
      reasons: m.review_reasons,
    })),
    sync: sync
      ? {
          last_synced_at: sync.last_synced_at,
          status: sync.last_sync_status,
          error: sync.last_sync_error,
          matches_awaiting_time: sync.awaiting_time_count,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// S2 — explain a gap
// ---------------------------------------------------------------------------

export async function explainGapForMatch(
  ctx: McpPlannerContext,
  matchId: string,
) {
  const result = await findCandidatesForMatch(ctx, matchId);
  const summary = summarizeGap(result.candidates);
  return {
    match: result.match,
    poll: result.poll,
    slot: result.slot,
    availability_note: result.availability_note,
    counts: {
      ready: summary.ready.length,
      under_level: summary.under_level.length,
      booked_elsewhere: summary.booked_elsewhere.length,
      said_no: summary.said_no.length,
      no_response: summary.no_response.length,
      already_assigned: summary.already_assigned.length,
    },
    ...summary,
  };
}

// ---------------------------------------------------------------------------
// S3 — match and umpire notes
// ---------------------------------------------------------------------------

export async function setMatchNotes(
  ctx: McpPlannerContext,
  matchId: string,
  notes: string,
) {
  const normalized = normalizeNoteOrUserError(notes);
  const { data, error } = await db()
    .from("matches")
    .update({ notes: normalized })
    .eq("id", matchId)
    .eq("organization_id", ctx.organizationId)
    .select("id, home_team, away_team, notes")
    .maybeSingle();
  throwDb(error);
  if (!data) {
    throw new McpUserError(
      `Match ${matchId} not found in this club. Use list_matches to find valid match ids.`,
    );
  }
  return {
    match_id: data.id,
    label: `${data.home_team} – ${data.away_team}`,
    notes: data.notes,
  };
}

export async function setUmpireNotes(
  ctx: McpPlannerContext,
  umpireId: string,
  notes: string,
) {
  const normalized = normalizeNoteOrUserError(notes);
  const { data, error } = await db()
    .from("organization_umpires")
    .update({ notes: normalized })
    .eq("organization_id", ctx.organizationId)
    .eq("umpire_id", umpireId)
    .select("umpire_id, notes")
    .maybeSingle();
  throwDb(error);
  if (!data) {
    throw new McpUserError(
      `Umpire ${umpireId} is not on this club's roster. Use list_umpires to find valid umpire ids.`,
    );
  }
  return { umpire_id: data.umpire_id, notes: data.notes };
}

function normalizeNoteOrUserError(notes: string): string | null {
  try {
    return normalizeNote(notes);
  } catch {
    throw new McpUserError(
      `Note cannot be longer than ${MAX_NOTE_LENGTH} characters.`,
    );
  }
}

// ---------------------------------------------------------------------------
// S4 — match create and update
// ---------------------------------------------------------------------------

export type MatchWriteInput = {
  date?: string;
  /** Local Amsterdam kick-off "HH:mm"; empty string clears the time. */
  time?: string;
  home_team?: string;
  away_team?: string;
  competition?: string | null;
  venue?: string | null;
  field?: string | null;
  required_level?: 1 | 2 | 3;
  notes?: string | null;
};

/** "2026-09-05 08:30" (club-local render) → "08:30". */
function localTimeOfDay(iso: string): string {
  return localFormat.format(new Date(iso)).slice(-5);
}

function isDuplicateKey(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

export async function createMatchForPlanner(
  ctx: McpPlannerContext,
  input: MatchWriteInput,
) {
  if (!input.date || !input.home_team?.trim() || !input.away_team?.trim()) {
    throw new McpUserError("date, home_team and away_team are required.");
  }
  const row = {
    date: input.date,
    start_time: input.time
      ? composeAmsterdamTimestamp(input.date, input.time)
      : null,
    home_team: input.home_team.trim(),
    away_team: input.away_team.trim(),
    competition: input.competition?.trim() || null,
    venue: input.venue?.trim() || null,
    field: input.field?.trim() || null,
    required_level: input.required_level ?? 1,
    notes: input.notes != null ? normalizeNoteOrUserError(input.notes) : null,
    created_by: ctx.userId,
    organization_id: ctx.organizationId,
  };
  const { data, error } = await db()
    .from("matches")
    .insert(row)
    .select("*")
    .single();
  if (isDuplicateKey(error)) {
    throw new McpUserError(
      "A match with this date and these teams already exists in this club.",
    );
  }
  throwDb(error);
  const match = data as Match;
  return {
    created: matchSummary(match),
    note: "The match is not in any poll yet — use create_poll or add it in the app to collect availability.",
  };
}

export async function updateMatchForPlanner(
  ctx: McpPlannerContext,
  matchId: string,
  input: MatchWriteInput,
) {
  const client = db();
  const { data: existingRow, error: fetchError } = await client
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();
  throwDb(fetchError);
  if (!existingRow) {
    throw new McpUserError(
      `Match ${matchId} not found in this club. Use list_matches to find valid match ids.`,
    );
  }
  const existing = existingRow as Match;

  const updates: Record<string, unknown> = {};
  if (input.home_team !== undefined) {
    if (!input.home_team.trim())
      throw new McpUserError("home_team cannot be empty.");
    updates.home_team = input.home_team.trim();
  }
  if (input.away_team !== undefined) {
    if (!input.away_team.trim())
      throw new McpUserError("away_team cannot be empty.");
    updates.away_team = input.away_team.trim();
  }
  if (input.competition !== undefined)
    updates.competition = input.competition?.trim() || null;
  if (input.venue !== undefined) updates.venue = input.venue?.trim() || null;
  if (input.field !== undefined) updates.field = input.field?.trim() || null;
  if (input.required_level !== undefined)
    updates.required_level = input.required_level;
  if (input.notes !== undefined)
    updates.notes =
      input.notes != null ? normalizeNoteOrUserError(input.notes) : null;

  // Date and time are interdependent: the stored start_time must stay on the
  // stored date, so recompose it whenever either half changes.
  const newDate = input.date ?? existing.date;
  if (input.date !== undefined) updates.date = input.date;
  if (input.time !== undefined) {
    updates.start_time = input.time
      ? composeAmsterdamTimestamp(newDate, input.time)
      : null;
  } else if (input.date !== undefined && existing.start_time) {
    updates.start_time = composeAmsterdamTimestamp(
      newDate,
      localTimeOfDay(existing.start_time),
    );
  }

  if (Object.keys(updates).length === 0) {
    throw new McpUserError("No fields to update were provided.");
  }

  const { data, error } = await client
    .from("matches")
    .update(updates)
    .eq("id", matchId)
    .eq("organization_id", ctx.organizationId)
    .select("*")
    .single();
  if (isDuplicateKey(error)) {
    throw new McpUserError(
      "A match with this date and these teams already exists in this club.",
    );
  }
  throwDb(error);
  const match = data as Match;

  const scheduleChanged = input.date !== undefined || input.time !== undefined;
  let caution: string | undefined;
  if (scheduleChanged) {
    const { data: links, error: linkError } = await client
      .from("poll_matches")
      .select("poll_id")
      .eq("match_id", matchId);
    throwDb(linkError);
    if ((links ?? []).length > 0) {
      caution =
        "This match is in a poll; poll time slots are not recalculated automatically. Review the poll in the app.";
    }
  }
  return { updated: matchSummary(match), caution };
}

// ---------------------------------------------------------------------------
// S5 — poll creation
// ---------------------------------------------------------------------------

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export async function createPollForPlanner(
  ctx: McpPlannerContext,
  title: string,
  matchIds: string[],
) {
  const trimmed = title.trim();
  if (!trimmed) throw new McpUserError("Title is required.");
  const uniqueIds = [...new Set(matchIds)];
  if (uniqueIds.length === 0)
    throw new McpUserError("At least one match is required.");

  const client = db();
  const matchRows = await selectInBatches<{
    id: string;
    start_time: string | null;
  }>(uniqueIds, (batch) =>
    client
      .from("matches")
      .select("id, start_time")
      .in("id", batch)
      .eq("organization_id", ctx.organizationId),
  );
  const found = new Set((matchRows ?? []).map((m) => m.id as string));
  const missing = uniqueIds.filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new McpUserError(
      `These matches were not found in this club: ${missing.join(", ")}.`,
    );
  }

  const withTime = (matchRows ?? []).filter((m) => m.start_time !== null) as {
    id: string;
    start_time: string;
  }[];
  const slots = groupMatchesIntoSlots(withTime);
  const token = nanoid(12);

  const { data: poll, error: pollError } = await client
    .from("polls")
    .insert({
      title: trimmed,
      token,
      status: "open",
      created_by: ctx.userId,
      organization_id: ctx.organizationId,
    })
    .select("*")
    .single();
  throwDb(pollError);

  const { error: pmError } = await client
    .from("poll_matches")
    .insert(uniqueIds.map((id) => ({ poll_id: poll.id, match_id: id })));
  throwDb(pmError);

  if (slots.length > 0) {
    const { error: slotError } = await client.from("poll_slots").insert(
      slots.map((s) => ({
        poll_id: poll.id,
        start_time: s.start.toISOString(),
        end_time: s.end.toISOString(),
      })),
    );
    throwDb(slotError);
  }

  return {
    poll_id: poll.id as string,
    title: trimmed,
    status: "open",
    match_count: uniqueIds.length,
    slot_count: slots.length,
    matches_without_time: uniqueIds.length - withTime.length,
    url: `${siteUrl()}/poll/${token}`,
    note: "The poll link is NOT sent to anyone automatically — the planner shares it with the umpires themselves.",
  };
}

// ---------------------------------------------------------------------------
// S6 — sync triage
// ---------------------------------------------------------------------------

export async function getSyncStatus(ctx: McpPlannerContext) {
  const client = db();
  const [stateRes, trackedRes, flaggedRes] = await Promise.all([
    client
      .from("hockey_sync_state")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .maybeSingle(),
    client
      .from("tracked_teams")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", ctx.organizationId),
    client
      .from("matches")
      .select(
        "id, date, start_time, home_team, away_team, review_reasons, cancelled_upstream",
      )
      .eq("organization_id", ctx.organizationId)
      .eq("needs_review", true)
      .order("date"),
  ]);
  throwDb(stateRes.error);
  throwDb(trackedRes.error);
  throwDb(flaggedRes.error);

  const state = stateRes.data;
  return {
    tracked_teams: trackedRes.count ?? 0,
    sync: state
      ? {
          last_synced_at: state.last_synced_at,
          status: state.last_sync_status,
          error: state.last_sync_error,
          last_inserted: state.last_inserted,
          last_updated: state.last_updated,
          last_flagged: state.last_flagged,
          matches_awaiting_time: state.awaiting_time_count,
        }
      : null,
    flagged_matches: (flaggedRes.data ?? []).map((m) => ({
      id: m.id,
      date: m.date,
      local_time: local(m.start_time),
      label: `${m.home_team} – ${m.away_team}`,
      reasons: m.review_reasons,
      cancelled_upstream: m.cancelled_upstream || undefined,
    })),
    note:
      state === null
        ? "This club has never synced with the Match Center."
        : undefined,
  };
}

export async function clearReviewFlags(
  ctx: McpPlannerContext,
  matchId: string,
) {
  // cancelled_upstream stays set so the match keeps its cancelled styling
  // until the planner deletes it (same rule as the app's clear action).
  const { data, error } = await db()
    .from("matches")
    .update({ needs_review: false, review_reasons: [] })
    .eq("id", matchId)
    .eq("organization_id", ctx.organizationId)
    .select("id, home_team, away_team")
    .maybeSingle();
  throwDb(error);
  if (!data) {
    throw new McpUserError(
      `Match ${matchId} not found in this club. Use get_sync_status to list flagged matches.`,
    );
  }
  return {
    match_id: data.id,
    label: `${data.home_team} – ${data.away_team}`,
    cleared: true,
  };
}

// ---------------------------------------------------------------------------
// S7 — withdrawn availability
// ---------------------------------------------------------------------------

export async function listWithdrawals(ctx: McpPlannerContext, limit: number) {
  const client = db();
  const { data, error } = await client
    .from("availability_override_logs")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  throwDb(error);
  const logs = data ?? [];

  const umpireIds = [...new Set(logs.map((l) => l.umpire_id).filter(Boolean))];
  const matchIds = [...new Set(logs.map((l) => l.match_id).filter(Boolean))];
  const slotIds = [...new Set(logs.map((l) => l.slot_id).filter(Boolean))];

  const [umpireRows, matchRows, slotRows] = await Promise.all([
    selectInBatches<{ id: string; name: string }>(umpireIds, (batch) =>
      client.from("umpires").select("id, name").in("id", batch),
    ),
    selectInBatches<{
      id: string;
      date: string;
      home_team: string;
      away_team: string;
    }>(matchIds, (batch) =>
      client
        .from("matches")
        .select("id, date, home_team, away_team")
        .in("id", batch)
        .eq("organization_id", ctx.organizationId),
    ),
    selectInBatches<{ id: string; start_time: string; end_time: string }>(
      slotIds,
      (batch) =>
        client
          .from("poll_slots")
          .select("id, start_time, end_time")
          .in("id", batch),
    ),
  ]);

  const nameById = new Map(umpireRows.map((u) => [u.id, u.name]));
  const matchById = new Map(matchRows.map((m) => [m.id, m]));
  const slotById = new Map(slotRows.map((s) => [s.id, s]));

  return {
    withdrawals: logs.map((l) => {
      const match = l.match_id ? matchById.get(l.match_id) : null;
      const slot = l.slot_id ? slotById.get(l.slot_id) : null;
      return {
        at: local(l.created_at),
        umpire_id: l.umpire_id,
        umpire: l.umpire_id
          ? (nameById.get(l.umpire_id) ?? "(removed umpire)")
          : "(removed umpire)",
        match_id: l.match_id,
        match: match
          ? `${match.home_team} – ${match.away_team} (${match.date})`
          : null,
        slot: slot
          ? `${local(slot.start_time)} – ${local(slot.end_time)}`
          : null,
        previous_response: l.previous_response,
        new_response: l.new_response,
        policy: l.policy,
        outcome: l.outcome,
      };
    }),
    note: "outcome 'confirmed' means the withdrawal was saved (warn mode); 'blocked' means it was prevented (lock mode). Assignments are never removed automatically — follow up with the umpire.",
  };
}

// ---------------------------------------------------------------------------
// S8 — day sheet
// ---------------------------------------------------------------------------

export async function getDaySheet(
  ctx: McpPlannerContext,
  dateFrom: string,
  dateTo: string,
) {
  const client = db();
  const { data: matchRows, error } = await client
    .from("matches")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .gte("date", dateFrom)
    .lte("date", dateTo)
    .order("date")
    .order("start_time");
  throwDb(error);
  const matches = (matchRows ?? []) as Match[];
  const matchIds = matches.map((m) => m.id);

  const [assignmentRows, roster] = await Promise.all([
    selectInBatches<{ match_id: string; umpire_id: string; status: string }>(
      matchIds,
      (batch) =>
        client
          .from("assignments")
          .select("match_id, umpire_id, status")
          .eq("organization_id", ctx.organizationId)
          .in("match_id", batch),
    ),
    getRoster(client, ctx.organizationId),
  ]);
  const nameById = new Map(roster.map((u) => [u.id, u.name]));

  const byMatch = new Map<string, { name: string; status: string }[]>();
  for (const a of assignmentRows) {
    const list = byMatch.get(a.match_id) ?? [];
    list.push({
      name: nameById.get(a.umpire_id) ?? a.umpire_id,
      status: a.status,
    });
    byMatch.set(a.match_id, list);
  }

  return {
    from: dateFrom,
    to: dateTo,
    matches: matches.map((m) => {
      const assigned = byMatch.get(m.id) ?? [];
      return {
        date: m.date,
        time: m.start_time ? local(m.start_time)?.slice(-5) : null,
        label: matchLabel(m),
        venue: m.venue,
        field: m.field,
        required_level: m.required_level,
        cancelled_upstream: m.cancelled_upstream || undefined,
        umpires: assigned
          .filter((a) => a.status === "confirmed")
          .map((a) => a.name),
        tentative: assigned
          .filter((a) => a.status === "tentative")
          .map((a) => a.name),
      };
    }),
    note: "The official spreadsheet export lives in the app; this is a conversational read-out. 'tentative' names are unconfirmed drafts.",
  };
}

// ---------------------------------------------------------------------------
// S1 — chase-message context (used by the draft_chase_message prompt)
// ---------------------------------------------------------------------------

export async function getChaseContext(ctx: McpPlannerContext, pollId: string) {
  const client = db();
  const poll = await getPollScoped(client, ctx, pollId);
  const availability = await getPollAvailability(ctx, pollId);
  return {
    poll_title: poll.title,
    poll_status: poll.status,
    poll_url: `${siteUrl()}/poll/${poll.token}`,
    club: ctx.organizationName,
    non_responders: availability.non_responders,
    at_risk_slots: availability.slot_risk.filter((s) => s.at_risk),
    respondents: availability.respondents,
    roster_size: availability.roster_size,
  };
}
