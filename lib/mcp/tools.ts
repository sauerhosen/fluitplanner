import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import type { McpPlannerContext } from "@/lib/mcp/auth";
import {
  McpUserError,
  getContext,
  getAttentionItems,
  listMatches,
  listUmpires,
  listPolls,
  getPollAvailability,
  getAssignments,
  getUmpireWorkloads,
  findCandidatesForMatch,
  checkPollAssignments,
  setTentativeAssignments,
  clearTentativeAssignments,
  explainGapForMatch,
  setMatchNotes,
  setUmpireNotes,
  createMatchForPlanner,
  updateMatchForPlanner,
  createPollForPlanner,
  addMatchesToPollForPlanner,
  getSyncStatus,
  clearReviewFlags,
  listWithdrawals,
  getDaySheet,
  getChaseContext,
} from "@/lib/mcp/data";

export const MCP_SERVER_INSTRUCTIONS = `Fluitplanner plans which club umpires officiate which field hockey matches. This connection is scoped to one club and one planner; the app remains the system of record.

Typical session: start with get_context, then get_attention_items. To draft a plan for a poll: get_poll_availability (who can, who is silent), get_assignments (current state), get_umpire_workload (fairness), find_candidates per hard-to-fill match, validate with check_assignments, and write the draft with set_tentative_assignments. When proposing names, state the reasoning per match: availability, level, absence of clashes, and workload.

Everything written through this server is a tentative draft. Confirming assignments, opening/closing polls, and contacting umpires are deliberate human actions in the app — never claim to have done them. Availability polls use 2-hour time slots that start at least 20 minutes before the match, so availability is per slot, not per exact match time.`;

const pollId = z.uuid().describe("Poll id (from list_polls)");
const matchId = z.uuid().describe("Match id (from list_matches)");
const umpireId = z.uuid().describe("Umpire id (from list_umpires)");

const proposalItem = z.object({
  match_id: matchId,
  umpire_id: umpireId,
});

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return jsonResult(await fn());
  } catch (error) {
    if (error instanceof McpUserError) {
      return {
        isError: true,
        content: [{ type: "text", text: error.message }],
      };
    }
    console.error("[mcp] tool failed:", error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "The request failed unexpectedly. Try again; if it keeps failing, the planner should check the Fluitplanner status.",
        },
      ],
    };
  }
}

export function registerMcpTools(server: McpServer, ctx: McpPlannerContext) {
  server.registerTool(
    "get_context",
    {
      title: "Who am I / which club",
      description:
        "The caller's club, role, and scope of this connection, plus a small snapshot (roster size, open polls, upcoming matches, availability lock mode). Call this first in a session.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    () => run(() => getContext(ctx)),
  );

  server.registerTool(
    "get_attention_items",
    {
      title: "What needs attention",
      description:
        "The planner's front door: unfilled matches in open polls, open polls with a low response rate, upcoming matches not yet in any poll, matches flagged by the federation sync, and the last sync status.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    () => run(() => getAttentionItems(ctx)),
  );

  server.registerTool(
    "list_matches",
    {
      title: "List matches",
      description:
        "The club's matches with filters and fill state. Each row includes poll membership, confirmed and tentative umpires, and fill (empty/partial/full, counted on confirmed assignments only). Cancelled matches are hidden unless include_cancelled is set.",
      inputSchema: z.object({
        date_from: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Earliest match date, YYYY-MM-DD"),
        date_to: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional()
          .describe("Latest match date, YYYY-MM-DD"),
        team: z
          .string()
          .optional()
          .describe("Substring match on home or away team name"),
        competition: z
          .string()
          .optional()
          .describe("Substring match on competition name"),
        required_level: z
          .union([z.literal(1), z.literal(2), z.literal(3)])
          .optional()
          .describe("Only matches requiring this umpire level"),
        needs_review: z
          .boolean()
          .optional()
          .describe(
            "Only matches flagged (true) or not flagged (false) after a sync",
          ),
        include_cancelled: z
          .boolean()
          .optional()
          .describe("Include matches cancelled upstream (default false)"),
        fill: z
          .enum(["empty", "partial", "full"])
          .optional()
          .describe("Filter by confirmed-assignment fill state"),
        unpolled: z
          .boolean()
          .optional()
          .describe("Only matches that are in no poll yet"),
        poll_id: z.uuid().optional().describe("Only matches in this poll"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("Max rows, default 200"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (args) => run(() => listMatches(ctx, args)),
  );

  server.registerTool(
    "list_umpires",
    {
      title: "List umpire roster",
      description:
        "The club's umpire roster: name, level (1-3), the club's private note on each person, and their workload counts. Contact details are deliberately not included — contacting umpires happens through the app.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    () => run(() => listUmpires(ctx)),
  );

  server.registerTool(
    "list_polls",
    {
      title: "List availability polls",
      description:
        "All availability polls with status (open/closed), the period their slots cover, match count, and how many roster members responded. For per-slot answers and non-responders use get_poll_availability.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    () => run(() => listPolls(ctx)),
  );

  server.registerTool(
    "get_poll_availability",
    {
      title: "Poll availability & silence",
      description:
        "One poll in full: per slot who said yes / if-need-be / no, which matches sit in each slot, who has not answered at all (the chase list), and per-slot fill risk (supply of yes+if-need-be vs the two-umpires-per-match demand).",
      inputSchema: z.object({ poll_id: pollId }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (args) => run(() => getPollAvailability(ctx, args.poll_id)),
  );

  server.registerTool(
    "get_assignments",
    {
      title: "Assignment state for a poll",
      description:
        "Who is on which match in a poll, tentative or confirmed, and where the gaps are (each match needs two confirmed umpires).",
      inputSchema: z.object({ poll_id: pollId }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (args) => run(() => getAssignments(ctx, args.poll_id)),
  );

  server.registerTool(
    "get_umpire_workload",
    {
      title: "Umpire workload history",
      description:
        "Per umpire: confirmed and tentative assignment counts, upcoming confirmed matches, and the date they last officiated — the raw material for fair proposals.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    () => run(() => getUmpireWorkloads(ctx)),
  );

  server.registerTool(
    "find_candidates",
    {
      title: "Find candidates for a match",
      description:
        "Every roster umpire assessed against one match's hard constraints: slot availability, qualification level, clashes with their other assignments (any poll), plus workload and the club's notes. Sorted best candidate first; unavailable people are included so exclusions can be explained.",
      inputSchema: z.object({ match_id: matchId }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (args) => run(() => findCandidatesForMatch(ctx, args.match_id)),
  );

  server.registerTool(
    "check_assignments",
    {
      title: "Check conflicts & eligibility",
      description:
        "Validate a poll's assignments — optionally together with a proposed set of additions — against the app's rules: double bookings across all polls, same-day pairings, level mismatches, people assigned despite answering no, overfilled matches. Run this before set_tentative_assignments. With no proposal it audits the current state.",
      inputSchema: z.object({
        poll_id: pollId,
        proposed: z
          .array(proposalItem)
          .max(200)
          .optional()
          .describe(
            "Proposed additional assignments to validate; omit to audit the current state",
          ),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (args) =>
      run(() => checkPollAssignments(ctx, args.poll_id, args.proposed ?? [])),
  );

  server.registerTool(
    "set_tentative_assignments",
    {
      title: "Write tentative assignments",
      description:
        "Write a drafted plan into a poll as tentative assignments for the planner to review and confirm in the app. Never touches confirmed assignments; pairs that already exist and pairs that would double-book an umpire are skipped and reported. Set replace_existing_tentative to swap out the previous draft.",
      inputSchema: z.object({
        poll_id: pollId,
        assignments: z
          .array(proposalItem)
          .min(1)
          .max(200)
          .describe("The drafted match/umpire pairs to write as tentative"),
        replace_existing_tentative: z
          .boolean()
          .optional()
          .describe(
            "Delete the poll's existing tentative draft first (default false)",
          ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    (args) =>
      run(() =>
        setTentativeAssignments(
          ctx,
          args.poll_id,
          args.assignments,
          args.replace_existing_tentative ?? false,
        ),
      ),
  );

  server.registerTool(
    "clear_tentative_assignments",
    {
      title: "Clear tentative draft",
      description:
        "Delete all tentative assignments in a poll — discard the current draft. Confirmed assignments are never touched.",
      inputSchema: z.object({ poll_id: pollId }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    (args) => run(() => clearTentativeAssignments(ctx, args.poll_id)),
  );

  const dateString = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .describe("Date, YYYY-MM-DD");
  const timeString = z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .describe("Local Amsterdam kick-off time, HH:mm (24h)");
  const matchFields = {
    time: timeString
      .or(z.literal(""))
      .optional()
      .describe(
        "Local Amsterdam kick-off time, HH:mm (24h). Empty string clears the time.",
      ),
    home_team: z.string().max(200).optional(),
    away_team: z.string().max(200).optional(),
    competition: z.string().max(200).nullable().optional(),
    venue: z.string().max(200).nullable().optional(),
    field: z.string().max(200).nullable().optional(),
    required_level: z
      .union([z.literal(1), z.literal(2), z.literal(3)])
      .optional()
      .describe("Minimum umpire level this match requires"),
    notes: z
      .string()
      .max(2000)
      .nullable()
      .optional()
      .describe("Planner note; empty or null clears it"),
  };

  server.registerTool(
    "explain_gap",
    {
      title: "Explain why a match is unfilled",
      description:
        "Why a match is (or is not) fillable: who could still take it (ready), and into which dead end everyone else falls — said no, silent, booked in an overlapping slot, below the required level, or already on the match. Use find_candidates for the full per-umpire detail.",
      inputSchema: z.object({ match_id: matchId }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (args) => run(() => explainGapForMatch(ctx, args.match_id)),
  );

  server.registerTool(
    "get_day_sheet",
    {
      title: "Day sheet",
      description:
        "The schedule for a date or date range, read out in conversation: per match the time, venue, field, required level, confirmed umpires, and any unconfirmed tentative names. The official spreadsheet export stays in the app.",
      inputSchema: z.object({
        date_from: dateString,
        date_to: dateString
          .optional()
          .describe("Defaults to date_from (a single day)"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (args) =>
      run(() =>
        getDaySheet(ctx, args.date_from, args.date_to ?? args.date_from),
      ),
  );

  server.registerTool(
    "get_sync_status",
    {
      title: "Match Center sync status",
      description:
        "Sync triage for the federation (Match Center) feed: when the last sync ran, what it inserted/updated/flagged, and every match currently flagged for review with its reasons. Clear handled flags with clear_match_review_flags.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    () => run(() => getSyncStatus(ctx)),
  );

  server.registerTool(
    "list_availability_withdrawals",
    {
      title: "Withdrawn availability",
      description:
        "Umpires who changed a yes/if-need-be to no on a slot they were already assigned to, newest first — including whether the change was saved (warn mode) or blocked (lock mode). Assignments are never removed automatically.",
      inputSchema: z.object({
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Max rows, default 50"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (args) => run(() => listWithdrawals(ctx, args.limit ?? 50)),
  );

  server.registerTool(
    "set_match_notes",
    {
      title: "Set match note",
      description:
        "Set or clear the planner note on a match (max 2000 characters; empty clears). Only the note is written — schedule fields are untouched.",
      inputSchema: z.object({
        match_id: matchId,
        notes: z
          .string()
          .max(2000)
          .describe("The note; empty string clears it"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    (args) => run(() => setMatchNotes(ctx, args.match_id, args.notes)),
  );

  server.registerTool(
    "set_umpire_notes",
    {
      title: "Set umpire note",
      description:
        "Set or clear this club's private note on a rostered umpire (max 2000 characters; empty clears). The note is per-club and never visible to the umpire.",
      inputSchema: z.object({
        umpire_id: umpireId,
        notes: z
          .string()
          .max(2000)
          .describe("The note; empty string clears it"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    (args) => run(() => setUmpireNotes(ctx, args.umpire_id, args.notes)),
  );

  server.registerTool(
    "create_match",
    {
      title: "Create match",
      description:
        "Add a match (e.g. a friendly) to the club's schedule. The match is not put in any poll automatically. Use update_match to change an existing one; deleting matches is app-only.",
      inputSchema: z.object({
        ...matchFields,
        date: dateString,
        home_team: z.string().min(1).max(200),
        away_team: z.string().min(1).max(200),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args) => run(() => createMatchForPlanner(ctx, args)),
  );

  server.registerTool(
    "update_match",
    {
      title: "Update match",
      description:
        "Correct fields on an existing match — move a kick-off, fix a venue, change the required level. Only the provided fields change; date and time stay consistent with each other. Poll slots are not recalculated automatically.",
      inputSchema: z.object({
        match_id: matchId,
        date: dateString.optional(),
        ...matchFields,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    (args) => {
      const { match_id, ...updates } = args;
      return run(() => updateMatchForPlanner(ctx, match_id, updates));
    },
  );

  server.registerTool(
    "create_poll",
    {
      title: "Create availability poll",
      description:
        "Create an open availability poll from a set of match ids; 2-hour time slots are computed automatically from the match times. Returns the poll link for the PLANNER to share — nothing is sent to umpires. Find matches first with list_matches (e.g. by date range).",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        match_ids: z.array(matchId).min(1).max(200),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    (args) => run(() => createPollForPlanner(ctx, args.title, args.match_ids)),
  );

  server.registerTool(
    "add_matches_to_poll",
    {
      title: "Add matches to a poll",
      description:
        "Add matches to an existing OPEN poll; time slots are extended automatically. Existing availability answers are kept, except when a new match shifts a slot's time window — then that slot's answers are discarded, which is counted and reported. Use create_poll for a new poll; matches already in the poll are skipped.",
      inputSchema: z.object({
        poll_id: pollId,
        match_ids: z.array(matchId).min(1).max(200),
      }),
      // Destructive: recomputing the slots can permanently discard answers
      // umpires have already given, so an auto-approving client must ask.
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    (args) =>
      run(() => addMatchesToPollForPlanner(ctx, args.poll_id, args.match_ids)),
  );

  server.registerTool(
    "clear_match_review_flags",
    {
      title: "Clear sync review flag",
      description:
        "Mark a sync-flagged match as handled: clears needs_review and its reasons. The cancelled-upstream marker stays until the planner deletes the match in the app.",
      inputSchema: z.object({ match_id: matchId }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    (args) => run(() => clearReviewFlags(ctx, args.match_id)),
  );

  server.registerPrompt(
    "draft_chase_message",
    {
      title: "Draft a chase message",
      description:
        "Draft a ready-to-paste reminder for the umpires who have not filled out an availability poll. The planner sends it themselves.",
      argsSchema: z.object({
        poll_id: pollId,
        channel: z
          .string()
          .optional()
          .describe("'whatsapp' (default) or 'email'"),
      }),
    },
    async (args) => {
      // Same failure shape as run(): a bad poll id becomes a usable prompt
      // message instead of a raw protocol error.
      let text: string;
      try {
        const chase = await getChaseContext(ctx, args.poll_id);
        const channel = args.channel === "email" ? "email" : "whatsapp";
        text = `Draft a friendly ${channel} reminder (in the language the planner is speaking, Dutch by default) for the umpires of ${chase.club} who have not filled out the availability poll "${chase.poll_title ?? ""}".

Data: ${JSON.stringify(chase)}

Guidelines: keep it short and warm, never guilt-trip; include the poll link; if at_risk_slots is non-empty, mention concretely which moments still need people; offer both a group version and, if the list is small, a personal per-name version. End by reminding the planner that THEY send the message — nothing has been sent.`;
      } catch (error) {
        if (error instanceof McpUserError) {
          text = `Tell the planner this chase message could not be prepared: ${error.message}`;
        } else {
          console.error("[mcp] draft_chase_message failed:", error);
          text =
            "Tell the planner the chase message could not be prepared because the request failed unexpectedly, and to try again.";
        }
      }
      return {
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text },
          },
        ],
      };
    },
  );
}
