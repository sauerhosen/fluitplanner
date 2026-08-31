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
        "Write a drafted plan into a poll as tentative assignments for the planner to review and confirm in the app. Never touches confirmed assignments; pairs that already exist are skipped and reported. Set replace_existing_tentative to swap out the previous draft.",
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
}
