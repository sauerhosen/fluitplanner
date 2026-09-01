# MCP server

Fluitplanner exposes a [Model Context Protocol](https://modelcontextprotocol.io) server at
`/api/mcp` so a club's planner can connect their own AI assistant (such as Claude) to their
club's data. Scope and rationale live in
[`docs/plans/2026-08-31-mcp-server-brainstorm.md`](plans/2026-08-31-mcp-server-brainstorm.md);
this document describes what was built.

## Connecting

There are two ways in; both end at the same per-request planner checks.

**OAuth (claude.ai custom connectors, and any OAuth-capable MCP client).** Add
`https://<your-domain>/api/mcp` as a custom connector — no manual token. The client
discovers the flow via `/.well-known/oauth-protected-resource` (advertised on the 401
challenge), registers itself (DCR) or identifies with a Client ID Metadata Document URL
(CIMD), and sends the planner through `/oauth/authorize`: they log in if needed, pick
which of their clubs the connection may access, and approve. Codes are PKCE-only (S256),
single-use, 10 minutes; access tokens (`fpa_…`) live 1 hour; refresh tokens (`fpr_…`)
rotate on every use, killing the previous pair.

**Personal access token (header-capable clients).** As a planner, open **Settings →
Claude / MCP connection** and create a token. The plaintext (`fpm_…`) is shown once; only
its SHA-256 hash is stored. Claude Code:

```bash
claude mcp add --transport http fluitplanner https://<your-domain>/api/mcp \
  --header "Authorization: Bearer fpm_..."
```

Tokens can be revoked in the same settings section; revocation takes effect immediately.

## Security model

- **One token = one planner in one club.** The token row binds `user_id` and
  `organization_id`. Every request re-checks the membership role (`planner`) and the
  organization's `is_active` flag, so demotion, removal, revocation, and club deactivation
  all cut access on the next call.
- **Tenant isolation.** MCP requests carry no session, so the proxy skips `/api/mcp`
  (like `/api/cron/*`) and the server authenticates itself. All queries run on the service
  client with explicit `organization_id` filters — the same belt-and-braces the server
  actions use on top of RLS.
- **Tentative-only writes.** The only mutations are writing and clearing _tentative_
  assignments. Confirmed assignments are never created, updated, or deleted through MCP;
  confirming stays a human action in the app. Umpires never see tentative rows (they read
  the `confirmed_assignments` view), so nothing Claude writes is umpire-visible.
- **No contact details.** The roster tool returns names, levels, notes, and workload —
  deliberately not email addresses.
- **OAuth hardening.** Redirect URIs must be https (http only for loopback) and are
  matched exactly; errors are never redirected to an unverified redirect_uri; the consent
  form re-validates everything server-side; CIMD documents are fetched with a timeout,
  size cap, and no redirects, and are cached so authorize and token agree on what was
  approved; RFC 8707 `resource` values are checked against `/api/mcp`.

## Tools

| Tool                          | Kind  | Purpose                                                               |
| ----------------------------- | ----- | --------------------------------------------------------------------- |
| `get_context`                 | read  | Caller, club, scope, snapshot (M1)                                    |
| `get_attention_items`         | read  | Unfilled matches, quiet polls, unpolled matches, sync flags (M13)     |
| `list_matches`                | read  | Filterable matches with fill state and assigned umpires (M2, M6)      |
| `list_umpires`                | read  | Roster with levels, club notes, workload (M3)                         |
| `list_polls`                  | read  | Polls, period covered, response counts (M4)                           |
| `get_poll_availability`       | read  | Per-slot yes/if-need-be/no, non-responders, slot fill risk (M5, M12)  |
| `get_assignments`             | read  | Assignment state and gaps for a poll (M6)                             |
| `get_umpire_workload`         | read  | Per-umpire counts and last officiated date (M9)                       |
| `find_candidates`             | read  | All roster umpires assessed against one match's hard constraints (M7) |
| `check_assignments`           | read  | Conflict/eligibility audit of current state or a proposal (M8)        |
| `set_tentative_assignments`   | write | Write a drafted plan as tentative rows (M11)                          |
| `clear_tentative_assignments` | write | Discard a poll's tentative draft                                      |

| `explain_gap` | read | Why a match is (or is not) fillable, bucketed per umpire (S2) |
| `get_day_sheet` | read | The weekend read out in conversation (S8) |
| `get_sync_status` | read | Sync triage: last run, changes, flagged matches (S6) |
| `list_availability_withdrawals` | read | Who pulled a yes after being assigned (S7) |
| `set_match_notes` / `set_umpire_notes` | write | Capture planner notes the moment they're said (S3) |
| `create_match` / `update_match` | write | Add a friendly, move a kick-off, fix a venue (S4) |
| `create_poll` | write | Poll from a plain request; link sharing stays manual (S5) |
| `clear_match_review_flags` | write | Mark a sync flag as handled (S6) |

The `draft_chase_message` prompt (S1) gathers non-responders, at-risk slots, and the poll
link, and asks the assistant to draft the reminder — the planner sends it. Proposing a
full plan (M10) is the assistant's reasoning over these tools, steered by the server's
`instructions` field.

## Implementation map

- `app/api/mcp/route.ts` — route handler (`mcp-handler` + `@modelcontextprotocol/server`)
- `lib/mcp/auth.ts` — bearer-token authentication → `McpPlannerContext`
- `lib/mcp/token.ts` — token generation/hashing (pure)
- `lib/mcp/planning.ts` — candidate assessment, conflict checking, slot risk (pure, unit-tested)
- `lib/mcp/data.ts` — org-scoped queries and the two tentative-write operations
- `lib/mcp/tools.ts` — tool registration, schemas, annotations
- `lib/actions/mcp-tokens.ts` + `components/settings/mcp-token-settings.tsx` — token management UI
- `supabase/migrations/20260831000001_mcp_tokens.sql` — token table + RLS
- `lib/oauth/` — tokens/PKCE (pure), client resolution (DCR + CIMD), grants (codes,
  issue/rotate/verify), discovery metadata
- `app/api/oauth/*` — register, token, and the two discovery documents (rewritten from
  `/.well-known/*` in `next.config.ts`); `app/oauth/authorize` + `components/oauth/consent-form.tsx`
  — the consent page (session-gated via the proxy's `next=` login round-trip)
- `supabase/migrations/20260831000002_oauth.sql` — clients, codes, tokens (service-role only)

## Local testing

With local Supabase and `npm run dev` running, create a token in the settings UI, then:

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:3000/api/mcp \
  --transport http --header "Authorization: Bearer fpm_..." --method tools/list
```
