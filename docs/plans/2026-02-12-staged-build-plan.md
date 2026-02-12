# Fluitplanner — Staged Build Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a field hockey umpire availability and match assignment app in incremental stages, each independently brainstormed and designed.

**Architecture:** Next.js App Router + Supabase (auth, DB, RLS). Planner (admin) interface behind auth. Umpire (user) interface via public shareable links. 2-hour time slots derived from match times.

**Tech Stack:** Next.js 15, Supabase (Postgres + Auth + RLS), TailwindCSS, shadcn/ui, Vitest, Playwright

---

## Stage Overview

Each stage is a self-contained deliverable. Later stages build on earlier ones but each stage ships working functionality. Each stage will get its own brainstorming session and detailed implementation plan.

---

## Stage 1: Database Schema & Core Domain Logic

**What:** Design and create the Supabase database schema + pure TypeScript domain logic for time slot calculation.

**Why first:** Everything depends on the data model. Getting slot calculation right (with TDD) is foundational and has zero UI dependencies.

**Scope:**

- Supabase migration: tables for `matches`, `umpires`, `polls`, `poll_slots`, `availability_responses`, `assignments`
- Row Level Security (RLS) policies: planner sees all, umpires see only their polls
- Pure function: `calculateSlot(matchTime: Date) => { start: Date, end: Date }` — 30 min before match, rounded down to nearest quarter hour, 2-hour duration
- Pure function: `groupMatchesIntoSlots(matches: Match[]) => Slot[]` — deduplicate overlapping slots
- TypeScript types for all domain entities
- Full TDD coverage for slot calculation edge cases

**Key decisions to brainstorm:**

- Exact schema design (poll-centric vs match-centric)
- How polls relate to matches (one poll per season? per week? per set of matches?)
- RLS policy design
- Whether umpires need Supabase auth or just a token-based link

---

## Stage 2: Match Management (Planner)

**What:** Planner can upload, view, edit, and delete matches.

**Why second:** Matches are the core data that everything else derives from. The planner needs to get matches into the system before anything else happens.

**Scope:**

- Protected route: `/protected/matches`
- Upload matches via: CSV file, Excel file (.xlsx), or copy-paste from spreadsheet
- Parse uploaded data: extract date, time, home team, away team, competition/level
- Match list view with sorting/filtering
- CRUD operations: add single match, edit match, delete match
- Server actions for all DB operations
- Validation (duplicate detection, required fields)

**Key decisions to brainstorm:**

- Expected CSV/Excel column format
- How to handle the copy-paste input (tab-separated? detect format?)
- Which parsing libraries to use (Papa Parse for CSV, SheetJS for Excel?)
- Match list UI design (table vs cards)

---

## Stage 3: Umpire Management (Planner)

**What:** Planner can manage the umpire roster.

**Why third:** Simple CRUD, needed before we can create polls or assign umpires.

**Scope:**

- Protected route: `/protected/umpires`
- Umpire list with name, email, phone (optional)
- Add, edit, delete umpires
- Import umpires (CSV or paste)
- Server actions for all DB operations

**Key decisions to brainstorm:**

- Umpire data fields (minimal vs extended)
- Whether umpires have accounts or are just entries in a table
- Bulk operations (select multiple, delete multiple)

---

## Stage 4: Availability Polls — Creation (Planner)

**What:** Planner can create availability polls from matches, generating time slots and shareable links.

**Why fourth:** This connects matches to the umpire-facing side. Requires matches (Stage 2) and umpires (Stage 3) to exist.

**Scope:**

- Protected route: `/protected/polls`
- Select matches → system calculates and deduplicates 2-hour time slots
- Preview slots before creating poll
- Generate poll with unique shareable link (token-based, no auth required)
- Poll list view showing status (open/closed, response count)
- Copy link / share via button

**Key decisions to brainstorm:**

- Poll creation UX (select date range? select individual matches? select all unpolled?)
- Link format and token generation strategy
- Whether to support multiple active polls simultaneously
- How to handle adding matches to an existing poll

---

## Stage 5: Availability Polls — Umpire Response (Public)

**What:** Umpires can open a poll link, enter their name, and indicate availability for each time slot.

**Why fifth:** This is the umpire-facing half of the poll system. The core user experience.

**Scope:**

- Public route: `/poll/[token]`
- Mobile-first responsive design (Rallly-style, see reference screenshots)
- Umpire enters name (or selects from dropdown if returning)
- For each 2-hour time slot: tap to cycle through Yes (green) / If need be (yellow) / No (red)
- Two layouts: mobile (vertical list) and desktop (horizontal grid like Rallly)
- Save responses (no auth required, just name + poll token)
- Ability to return and update responses later
- Show participant count and optionally other responses

**Key decisions to brainstorm:**

- Exact interaction design (tap to cycle? three separate buttons? swipe?)
- How to identify returning umpires (name match? browser cookie? short code?)
- Whether to show other umpires' responses before submitting
- Animation and visual feedback design

---

## Stage 6: Umpire Assignment (Planner)

**What:** Planner views availability overview and manually assigns two umpires per match.

**Why sixth:** Requires poll responses (Stage 5) to be meaningful.

**Scope:**

- Protected route: `/protected/assignments`
- Availability matrix: matches × umpires, colored by response (green/yellow/red/grey)
- Click to assign umpire to match (each match needs exactly 2)
- Visual indicators: assigned umpires highlighted, warnings for conflicts (double-booked umpire, no available umpires)
- Filter by date range, competition
- Assignment summary view

**Key decisions to brainstorm:**

- Matrix UI design (could be complex with many matches/umpires)
- How to handle umpire conflicts (same time slot, multiple matches)
- Whether to show "suggested" assignments based on availability
- Export/share assignment list

---

## Stage 7: Planner Dashboard & Polish

**What:** Landing dashboard for planners, navigation, and overall UX polish.

**Why last:** Ties everything together. Earlier stages each have their own routes; this adds the overview and navigation polish.

**Scope:**

- Replace template landing page with Fluitplanner branding
- Protected dashboard: upcoming matches, polls needing attention, recent activity
- Navigation sidebar/header for planner routes
- Cleanup: remove all template/demo components (tutorial/, hero, logos)
- Responsive design pass on all planner pages
- Loading states, error boundaries, empty states
- Dark mode consistency check

**Key decisions to brainstorm:**

- Dashboard layout and key metrics
- Navigation pattern (sidebar vs top nav)
- Branding / visual identity

---

## Dependency Graph

```
Stage 1 (Schema + Domain Logic)
  ├── Stage 2 (Match Management)
  │     └── Stage 4 (Poll Creation)
  │           └── Stage 5 (Umpire Response)
  │                 └── Stage 6 (Assignments)
  ├── Stage 3 (Umpire Management)
  │     └── Stage 4 (Poll Creation)
  └──────────────────── Stage 7 (Dashboard & Polish)
```

Stages 2 and 3 can be done in parallel after Stage 1.

---

## Out of Scope (Future)

- Automated umpire assignment algorithm
- Email/WhatsApp notifications
- Umpire authentication (login to see their assignments)
- Season/competition management
- Historical stats and reporting
- Real-time updates (WebSocket/Supabase realtime)
