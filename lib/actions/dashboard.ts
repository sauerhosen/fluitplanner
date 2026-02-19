"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTenantId } from "@/lib/tenant";
import { format, addDays } from "date-fns";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type DashboardStats = {
  upcomingMatches: number;
  openPolls: number;
  unassignedMatches: number;
  activeUmpires: number;
};

export type ActionItem = {
  type: "unassigned_match" | "low_response_poll" | "unpolled_match";
  label: string;
  href: string;
};

export type ActivityEvent =
  | {
      type: "response";
      participant: string;
      pollTitle: string;
      timestamp: string;
    }
  | {
      type: "assignment";
      umpire: string;
      homeTeam: string;
      awayTeam: string;
      timestamp: string;
    }
  | {
      type: "assignments_batch";
      count: number;
      timestamp: string;
    }
  | {
      type: "match_added";
      homeTeam: string;
      awayTeam: string;
      timestamp: string;
    }
  | {
      type: "matches_batch";
      count: number;
      timestamp: string;
    };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, user };
}

/* ------------------------------------------------------------------ */
/*  getDashboardStats                                                  */
/* ------------------------------------------------------------------ */

export async function getDashboardStats(): Promise<DashboardStats> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  const today = format(new Date(), "yyyy-MM-dd");
  const twoWeeksLater = format(addDays(new Date(), 14), "yyyy-MM-dd");

  // 1. Upcoming matches (next 14 days)
  const { count: upcomingMatches, error: matchError } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenantId)
    .gte("date", today)
    .lte("date", twoWeeksLater);

  if (matchError) throw new Error(matchError.message);

  // 2. Open polls
  const { count: openPolls, error: pollError } = await supabase
    .from("polls")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("organization_id", tenantId);

  if (pollError) throw new Error(pollError.message);

  // 3. Unassigned matches in open polls
  // Get all matches in open polls
  const { data: pollMatches, error: pmError } = await supabase
    .from("poll_matches")
    .select("poll_id, match_id, polls!inner(id, status, organization_id)")
    .eq("polls.status", "open")
    .eq("polls.organization_id", tenantId);

  if (pmError) throw new Error(pmError.message);

  const openPollIds = [
    ...new Set(
      (pollMatches ?? []).map((pm: { poll_id: string }) => pm.poll_id),
    ),
  ];

  let unassignedMatches = 0;
  if (openPollIds.length > 0) {
    // Get assignments for matches in open polls
    const { data: assignments, error: assignError } = await supabase
      .from("assignments")
      .select("match_id")
      .in("poll_id", openPollIds);

    if (assignError) throw new Error(assignError.message);

    // Count assignments per match
    const assignmentCounts = new Map<string, number>();
    for (const a of assignments ?? []) {
      assignmentCounts.set(
        a.match_id,
        (assignmentCounts.get(a.match_id) ?? 0) + 1,
      );
    }

    // Count matches with < 2 assignments
    const matchIdsInOpenPolls = [
      ...new Set(
        (pollMatches ?? []).map((pm: { match_id: string }) => pm.match_id),
      ),
    ];
    unassignedMatches = matchIdsInOpenPolls.filter(
      (matchId) => (assignmentCounts.get(matchId) ?? 0) < 2,
    ).length;
  }

  // 4. Active umpires (distinct umpire_ids from availability_responses, scoped via polls)
  const { data: umpireResponses, error: umpError } = await supabase
    .from("availability_responses")
    .select("umpire_id, polls!inner(organization_id)")
    .eq("polls.organization_id", tenantId)
    .not("umpire_id", "is", null);

  if (umpError) throw new Error(umpError.message);

  const activeUmpires = new Set(
    (umpireResponses ?? []).map((r: { umpire_id: string }) => r.umpire_id),
  ).size;

  return {
    upcomingMatches: upcomingMatches ?? 0,
    openPolls: openPolls ?? 0,
    unassignedMatches,
    activeUmpires,
  };
}

/* ------------------------------------------------------------------ */
/*  getActionItems                                                     */
/* ------------------------------------------------------------------ */

export async function getActionItems(): Promise<ActionItem[]> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();
  const items: ActionItem[] = [];

  const today = format(new Date(), "yyyy-MM-dd");
  const oneWeekLater = format(addDays(new Date(), 7), "yyyy-MM-dd");

  // 1. Get open polls
  const { data: openPolls, error: pollError } = await supabase
    .from("polls")
    .select("id, title")
    .eq("status", "open")
    .eq("organization_id", tenantId);

  if (pollError) throw new Error(pollError.message);

  const pollIds = (openPolls ?? []).map((p: { id: string }) => p.id);

  if (pollIds.length > 0) {
    // 2. Get poll_matches for open polls
    const { data: pollMatches, error: pmError } = await supabase
      .from("poll_matches")
      .select("poll_id, match_id")
      .in("poll_id", pollIds);

    if (pmError) throw new Error(pmError.message);

    // 3. Get assignments for open polls
    const { data: assignments, error: assignError } = await supabase
      .from("assignments")
      .select("match_id")
      .in("poll_id", pollIds);

    if (assignError) throw new Error(assignError.message);

    // Count assignments per match
    const assignmentCounts = new Map<string, number>();
    for (const a of assignments ?? []) {
      assignmentCounts.set(
        a.match_id,
        (assignmentCounts.get(a.match_id) ?? 0) + 1,
      );
    }

    // Group unassigned matches by poll
    const pollMap = new Map(
      (openPolls ?? []).map((p: { id: string; title: string }) => [p.id, p]),
    );

    const unassignedByPoll = new Map<string, number>();
    for (const pm of pollMatches ?? []) {
      if ((assignmentCounts.get(pm.match_id) ?? 0) < 2) {
        unassignedByPoll.set(
          pm.poll_id,
          (unassignedByPoll.get(pm.poll_id) ?? 0) + 1,
        );
      }
    }

    for (const [pollId, count] of unassignedByPoll) {
      const poll = pollMap.get(pollId);
      items.push({
        type: "unassigned_match",
        label: `${count} unassigned match${count > 1 ? "es" : ""} in ${poll?.title ?? "poll"}`,
        href: `/protected/polls/${pollId}?tab=assignments`,
      });
    }

    // 4. Low response polls (< 50% of umpires responded)
    const { data: responses, error: respError } = await supabase
      .from("availability_responses")
      .select("poll_id, umpire_id")
      .in("poll_id", pollIds);

    if (respError) throw new Error(respError.message);

    // Count distinct respondents per poll
    const respondentsPerPoll = new Map<string, Set<string>>();
    for (const r of responses ?? []) {
      if (!respondentsPerPoll.has(r.poll_id)) {
        respondentsPerPoll.set(r.poll_id, new Set());
      }
      if (r.umpire_id) {
        respondentsPerPoll.get(r.poll_id)!.add(r.umpire_id);
      }
    }

    const { count: totalUmpires, error: umpError } = await supabase
      .from("organization_umpires")
      .select("umpire_id", { count: "exact", head: true })
      .eq("organization_id", tenantId);

    if (umpError) throw new Error(umpError.message);

    if ((totalUmpires ?? 0) > 0) {
      for (const pollId of pollIds) {
        const respondentCount = respondentsPerPoll.get(pollId)?.size ?? 0;
        if (respondentCount / (totalUmpires ?? 1) < 0.5) {
          const poll = pollMap.get(pollId);
          items.push({
            type: "low_response_poll",
            label: `Low response rate for ${poll?.title ?? "poll"} (${respondentCount}/${totalUmpires})`,
            href: `/protected/polls/${pollId}`,
          });
        }
      }
    }
  } else {
    // Still need umpires count query path even with no polls
    // (no low response items to generate)
  }

  // 5. Unpolled matches in next 7 days
  const { data: upcomingMatches, error: mError } = await supabase
    .from("matches")
    .select("id, home_team, away_team, date")
    .eq("organization_id", tenantId)
    .gte("date", today)
    .lte("date", oneWeekLater);

  if (mError) throw new Error(mError.message);

  if ((upcomingMatches ?? []).length > 0) {
    const { data: allPollMatches, error: apmError } = await supabase
      .from("poll_matches")
      .select("match_id");

    if (apmError) throw new Error(apmError.message);

    const polledMatchIds = new Set(
      (allPollMatches ?? []).map((pm: { match_id: string }) => pm.match_id),
    );

    for (const match of upcomingMatches ?? []) {
      if (!polledMatchIds.has(match.id)) {
        items.push({
          type: "unpolled_match",
          label: `${match.home_team} vs ${match.away_team} (${match.date}) not in any poll`,
          href: "/protected/polls/new",
        });
      }
    }
  }

  return items;
}

/* ------------------------------------------------------------------ */
/*  getRecentActivity                                                  */
/* ------------------------------------------------------------------ */

/**
 * Group items by time proximity: items within `windowMs` of each other
 * are merged into a single group. Returns groups sorted by most recent first.
 */
function groupByTimeWindow<T>(
  items: T[],
  getTime: (item: T) => number,
  windowMs: number,
): T[][] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => getTime(b) - getTime(a));
  const groups: T[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const currentGroup = groups[groups.length - 1];
    const prevTime = getTime(currentGroup[currentGroup.length - 1]);
    const curTime = getTime(sorted[i]);
    if (prevTime - curTime <= windowMs) {
      groups[groups.length - 1].push(sorted[i]);
    } else {
      groups.push([sorted[i]]);
    }
  }
  return groups;
}

export async function getRecentActivity(): Promise<ActivityEvent[]> {
  const { supabase } = await requireAuth();
  const tenantId = await requireTenantId();

  // 1. Recent responses — fetch more rows, then deduplicate by participant + poll
  const { data: responses, error: respError } = await supabase
    .from("availability_responses")
    .select(
      "participant_name, poll_id, created_at, polls!inner(title, organization_id)",
    )
    .eq("polls.organization_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (respError) throw new Error(respError.message);

  // Deduplicate: keep only the most recent row per (participant_name, poll_id)
  const responseMap = new Map<
    string,
    {
      participant_name: string;
      created_at: string;
      polls:
        | { title: string; organization_id: string }[]
        | { title: string; organization_id: string }
        | null;
    }
  >();
  for (const r of responses ?? []) {
    const key = `${r.participant_name}::${r.poll_id}`;
    const existing = responseMap.get(key);
    if (!existing || r.created_at > existing.created_at) {
      responseMap.set(key, r);
    }
  }

  const responseEvents: ActivityEvent[] = Array.from(responseMap.values()).map(
    (r) => {
      const poll = Array.isArray(r.polls) ? r.polls[0] : r.polls;
      return {
        type: "response" as const,
        participant: r.participant_name,
        pollTitle: poll?.title ?? "poll",
        timestamp: r.created_at,
      };
    },
  );

  // 2. Recent assignments — group by time window (5s) to collapse batch operations
  const { data: assignments, error: assignError } = await supabase
    .from("assignments")
    .select("created_at, umpires(name), matches(home_team, away_team)")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (assignError) throw new Error(assignError.message);

  const assignmentGroups = groupByTimeWindow(
    assignments ?? [],
    (a) => new Date(a.created_at).getTime(),
    5000,
  );

  const assignmentEvents: ActivityEvent[] = assignmentGroups.map((group) => {
    const first = group[0];
    const umpire = Array.isArray(first.umpires)
      ? first.umpires[0]
      : first.umpires;
    const match = Array.isArray(first.matches)
      ? first.matches[0]
      : first.matches;

    if (group.length === 1) {
      return {
        type: "assignment" as const,
        umpire: umpire?.name ?? "Umpire",
        homeTeam: match?.home_team ?? "?",
        awayTeam: match?.away_team ?? "?",
        timestamp: first.created_at,
      };
    }
    return {
      type: "assignments_batch" as const,
      count: group.length,
      timestamp: first.created_at,
    };
  });

  // 3. Recent matches — group by time window (5s) to collapse bulk imports
  const { data: matches, error: matchError } = await supabase
    .from("matches")
    .select("home_team, away_team, created_at")
    .eq("organization_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (matchError) throw new Error(matchError.message);

  const matchGroups = groupByTimeWindow(
    matches ?? [],
    (m) => new Date(m.created_at).getTime(),
    5000,
  );

  const matchEvents: ActivityEvent[] = matchGroups.map((group) => {
    if (group.length === 1) {
      return {
        type: "match_added" as const,
        homeTeam: group[0].home_team,
        awayTeam: group[0].away_team,
        timestamp: group[0].created_at,
      };
    }
    return {
      type: "matches_batch" as const,
      count: group.length,
      timestamp: group[0].created_at,
    };
  });

  // Merge, sort descending, limit 10
  const allEvents = [...responseEvents, ...assignmentEvents, ...matchEvents];
  allEvents.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  return allEvents.slice(0, 10);
}
