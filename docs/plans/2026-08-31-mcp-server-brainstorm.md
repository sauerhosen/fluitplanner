# MCP Server — Objective &amp; Features

**Date:** 2026-08-31
**Status:** Brainstorm — objective and feature scope only. No technical design, no implementation.

**Decisions taken in this session**

| Question                      | Answer                                                  |
| ----------------------------- | ------------------------------------------------------- |
| Who is it for?                | The club planner (admin)                                |
| How much may Claude change?   | Read everything; write only the safe, reversible things |
| Reach                         | A product feature — any club's planner can connect      |
| Where does it hurt?           | The assignment puzzle, and chasing availability         |
| What kind of assistant?       | It proposes drafts; the planner edits them              |
| What makes a suggestion good? | Availability, level, no clashes, fairness               |

---

## 1. Objective

**Let a club's planner hand the two worst parts of the planning week — filling the matches, and chasing the
silence — to a conversation, while Fluitplanner stays the system of record and the only place anything becomes
real for an umpire.**

The app is already good at what a table is good at: listing matches, collecting availability, exporting a day  
sheet. It is bad at the part the planner actually loses an evening to.

That is a constraint problem across matches × slots × availability × levels × existing assignments × history.
It is miserable to do by eye in a UI, and it is exactly what a model is good at. The MCP server exists so the
planner can ask for a plan, argue with it, and accept it — instead of building it cell by cell.

### What success looks like

- From "the poll has been filled out" to "a tentative plan I mostly agree with" in one conversation.
- The planner always knows _why_ a name was suggested — availability, level, clash-free, and load — and can
  overrule any of it.
- Chasing becomes targeted: not "remind everyone", but "these six people, and here's the message".
- Every consequence an umpire can feel — a confirmed assignment, an opened or closed poll, a message sent —
  stays a deliberate human action in the app.
- A planner at any club connects their own Claude and sees exactly their own club, with exactly their own
  permissions.

### Principles behind the scope

1. **Scoped to the caller.** Same club, same role, same visibility as the web UI. Never wider.
2. **Tentative by default.** The app already separates tentative from confirmed assignments. That distinction
   is the safety mechanism: Claude drafts into tentative, a human confirms.
3. **Nothing reaches an umpire without a click.** Claude may write the message; the planner sends it.
4. **Read broadly, write narrowly.** The value is in the reading. The write list stays short and reversible.
5. **Show the reasoning.** A proposal the planner can't audit is a proposal they won't trust.
6. **A companion, not a second app.** No pursuit of UI parity — breadth for its own sake makes it worse.

---

## 2. Must have

_Without these, connecting isn't worth it._

**Knowing where you are**

- **M1 — Caller and club context.** Who is asking, which club, which role, which clubs they may act for. The
  safety boundary for a multi-club product, and the thing every other feature is scoped by.

**Seeing the board**

- **M2 — Matches, properly filterable.** By date range or weekend, team, competition, venue, required level,
  cancelled, flagged for review, and — critically — by whether they're filled, half-filled or empty.
- **M3 — The umpire roster.** Names, levels, and the club's own notes on each person.
- **M4 — Polls and their slots.** Which polls are open, what period they cover, which matches sit in them.
- **M5 — Availability, including the silence.** Per poll: who said yes, if-need-be and no, per slot — and
  explicitly _who hasn't answered at all_. The non-responder list is a first-class answer, not a by-product.
- **M6 — Assignment state.** Who is on which match, tentative or confirmed, and where the gaps are.

**Solving the puzzle**

- **M7 — Candidate search for a match.** "Who could do this one?" answered against the hard constraints:
  available for the slot, qualified for the level, not double-booked, not stranded between venues.
- **M8 — Conflict and eligibility check.** For a proposal or the current state: double bookings, overlapping
  slots, level mismatches, anyone assigned despite saying no. The app already knows these rules; Claude must
  be held to them rather than inventing plausible-looking names.
- **M9 — Workload history per umpire.** How much each person has done, and how recently. Fairness is a
  must-have input, so the raw material for it is too.
- **M10 — Propose a plan for a poll.** A complete tentative assignment set, with the reasoning per match, that
  the planner can push back on. This is the headline feature; M2–M9 exist to make it possible.
- **M11 — Write tentative assignments.** The proposal has to land somewhere the planner can review and confirm
  in the app. The single write that carries the value.

**Chasing**

- **M12 — Who to chase, and whether it matters.** The non-responder list, plus which slots are at risk of not
  filling given the answers so far — so the planner knows whether to chase hard or let it ride.

**The front door**

- **M13 — "What needs my attention."** Unfilled matches, quiet polls, matches flagged after a sync, deadlines
  approaching. The opening question of most sessions.

---

## 3. Should have

- **S1 — Draft the chase message.** A ready-to-paste WhatsApp or email nag, personal or group. The planner
  sends it. Writing these well is something Claude is straightforwardly better at than a template.
- **S2 — Explain a gap.** Not just "this match is unfilled" but _why_ — nobody qualified is free, everyone free
  is already booked, only one person said yes and they're doing the earlier game.
- **S3 — Match notes and umpire notes.** Cheap, reversible, and the natural way to capture "Anne can't do
  October mornings" the moment it's said, instead of losing it.
- **S4 — Match create and update.** Add a friendly, move a kick-off, correct a venue — without breaking out of
  the conversation for a one-field fix.
- **S5 — Poll creation from a plain request.** "Open a poll for the first two weekends of October." Creating
  is safe; sharing the link stays manual.
- **S6 — Sync triage.** When the last sync ran, what changed, which matches are flagged and why, and clearing
  a flag once handled. Recurring mechanical work that a conversation absorbs well.
- **S7 — Withdrawn availability.** Who pulled a yes after being assigned, and on which match. The app already
  logs this; today nobody looks until it hurts.
- **S8 — Day sheet and assignment list, read out in conversation.** A quick look at the weekend. The real
  spreadsheet export stays in the app.

---

## 4. Could have

- **C1 — Soft constraints.** The notes the club keeps on people (no mornings, prefers youth matches) and who
  pairs well with whom, folded into proposals. Explicitly _not_ a must — the hard constraints and fairness
  come first, and soft preferences are the easiest place for a model to over-reach.
- **C3 — Season analytics.** Coverage rates, response rates, hardest-to-fill fixtures, load distribution
  across the whole season.
- **C4 — Import from pasted text.** Drop a competition table into the conversation and get matches, mirroring
  the app's paste import.
- **C5 — Umpire-facing capability.** An umpire's own Claude setting their availability and reading their
  schedule. A different product with a different trust model — parked, not closed.
- **C6 — Proactive digest.** A scheduled "here's your weekend, here's what's missing" rather than waiting to
  be asked.
- **C7 — Multi-club planners.** Someone planning for two clubs switching context within a conversation.
- **C8 — Roster and team management.** Managed teams, tracked teams, level changes.
- **C9 — Development suggestions.** Umpires consistently handling above their level; candidates for promotion.

---

## 5. Won't have

_Excluded deliberately, with the reason, so it doesn't get relitigated._

| Excluded                                                                                          | Reason                                                                                                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Confirming assignments                                                                            | The moment a plan becomes real for umpires. Always a human click.                                       |
| Opening/closing polls, distributing poll links                                                    | Outward-facing. Claude may draft the message; a person sends it.                                        |
| Sending any email or invitation                                                                   | Irreversible and reputational.                                                                          |
| Deletes of any kind, and bulk destructive operations                                              | Not recoverable from a chat. The confirmation dialogs in the UI exist for a reason.                     |
| Master-admin and cross-club tools — organisation CRUD, user disable/delete, role changes, invites | A different persona and a far larger blast radius. Possibly a separate, separately-gated surface later. |
| Auth and account management — passwords, magic links, verification codes                          | Security-critical flows with their own deliberate UX.                                                   |
| Bulk export of umpire contact details                                                             | Personal data shouldn't be dumped into a chat transcript for convenience.                               |
| Auto-accepting its own plan, or any unattended planning run                                       | The planner reviewing the draft _is_ the safety model. Remove the review and there isn't one.           |
| UI parity / replacing the app                                                                     | It's a companion.                                                                                       |
| Writing to KNHB or any external system                                                            | Not ours to write to.                                                                                   |

---
