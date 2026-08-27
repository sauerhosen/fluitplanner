# Page chrome

How the top of a page is built: the identity row, the toolbar, and what happens
to them when you scroll. Applied first to the poll detail page; this document is
the reference for bringing the rest of the app onto the same pattern.

## Why

The poll detail page used to spend **196 px** between the page title and the
first row of the assignment grid — measured at 1400×900, that is 362 px from the
top of the window, or 40% of a laptop screen, gone before the first cell. It was
three stacked blocks (title + actions, share block, tab row), each claiming a
full row, with no hierarchy between them. The share block — a once-per-poll
action — was the loudest thing on screen after the title, while the tab row you
use constantly was pushed to the bottom.

The rebuilt header is **115 px**, and what remains earns its space. Together with
the layout change below, the first grid row moved from 362 px down the window to
**231 px**.

## The pattern

Two rows, and only two:

```
‹ Polls   Seizoen '26-'27 - tot herfstvakantie  (Open)          [Share ▾] [⋯]
[ Matches (11) | Responses (15) | Assignments ]     [All] [Export] [tools…]
```

**Row 1 — identity.** Where you are, what state it is in, and the one action you
came to take. Built with `components/shared/page-header.tsx`:

| Slot                     | Holds                                            | Rule                                                                                |
| ------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `backHref` / `backLabel` | Chevron to the list this record belongs to       | Always, on a detail page. Label hides below `sm`                                    |
| `title`                  | The record's name                                | A node, so it can be inline-editable. Click it to edit; the pencil appears on hover |
| `status`                 | A quiet pill: open/closed, draft/published       | State only — never a button                                                         |
| `actions`                | **One** primary button and **one** overflow menu | If a third control wants in, it belongs in the menu                                 |

**Row 2 — the toolbar.** What you operate the page's content with: tabs, date
filters, export, view toggles. Built with
`components/shared/sticky-toolbar.tsx`. It sticks to the top of the viewport
once you scroll past it, and grows a compact identity — back chevron plus
truncated title — on the same line while it is stuck, so scrolling never costs
you the knowledge of which record you are in.

Everything else that used to live up here goes into one of two places: the
primary action's dropdown, or the overflow menu.

## Rules

**One primary action per page.** On a poll that is Share, because a poll is
something you send to people. On a page with no obvious primary action, drop the
button entirely and keep only `⋯` — an invented primary is worse than none.

**The overflow menu is for the rare and the dangerous.** Close, reopen, rename,
delete. Two-step access is a feature for actions you take once a month and would
hate to hit by accident. Delete uses `variant="destructive"` and sits below a
separator.

**Labels stay on the buttons in the toolbar; icons alone are for the stuck bar.**
Icon-only controls need tooltips to stay learnable, which is a cost worth paying
only where space is genuinely scarce.

**No standalone labelled blocks.** A `<Label>` above a pair of buttons — the old
"Share link" block — is a form pattern. On a detail page, a control labels
itself.

**Never let a `<Label>`-style heading push the toolbar down.** Content-specific
headings ("Slots (14)") belong inside the tab panel, below the toolbar.

## Using it

```tsx
import { PageHeader } from "@/components/shared/page-header";
import { StickyToolbar } from "@/components/shared/sticky-toolbar";

<div className="flex min-w-0 flex-col gap-4">
  <PageHeader
    backHref="/protected/polls"
    backLabel={t("pageTitle")}
    title={
      <h1 className="truncate text-lg font-semibold sm:text-xl">
        {poll.title}
      </h1>
    }
    status={<Badge variant="default">{t("statusOpen")}</Badge>}
    actions={
      <>
        <SharePollButton token={poll.token} variant="menu" />
        <DropdownMenu>…</DropdownMenu>
      </>
    }
  />

  <StickyToolbar
    className="justify-between"
    compact={<Link href="/protected/polls">‹ {poll.title}</Link>}
  >
    <TabsList>…</TabsList>
    <div className="flex items-center gap-2">…tools…</div>
  </StickyToolbar>
</div>;
```

Use `gap-4` between the header and the toolbar. `gap-8` reads as two unrelated
sections; these are one piece of chrome.

### How the sticky detection works

`StickyToolbar` observes **itself** with an `IntersectionObserver` whose root is
shrunk by 1 px at the top (`rootMargin: "-1px 0px 0px 0px"`, `threshold: [0, 1]`).
While the bar sits in the flow it is fully inside that root (ratio 1); the moment
it pins to the top it pokes 1 px outside it (ratio < 1). A `boundingClientRect.top`
guard keeps a bar that is simply below the fold — outside the root for the
opposite reason — from reporting itself as stuck. Measured on the running app,
the flip lands on the exact pixel the bar reaches `top: 0`.

A separate sentinel element does not work, in either position. Above the bar it
is another flex item, so the parent's `gap` sits between the two — a row of dead
space while unstuck, and `stuck` flipping a whole gap early. Inside the bar it is
glued to the bar, never crosses a threshold, and the observer fires exactly once,
on setup.

The compact identity shares the row with the toolbar's own children rather than
adding a second line, so sticking never changes the bar's height and the page
never jumps. While collapsed it carries `inert` as well as `aria-hidden`, so
focus cannot land on an invisible back link, and `overflow-hidden`, so its
`shrink-0` children add no phantom width to the toolbar's horizontal scroll.

### The one layout constraint

`position: sticky` is measured against the nearest **scroll container**. The
authenticated layout wrapper (`app/protected/layout.tsx`) therefore uses
`overflow-x-clip`, not `overflow-hidden`: `clip` still contains the wide
assignment grid, but unlike `hidden` it does not create a scroll container, so
sticky children keep sticking to the viewport. If a toolbar ever sticks to the
wrong place — or scrolls away with the page — an ancestor grew an `overflow`
that is not `visible` or `clip`.

## Where it is applied

Every authenticated page now uses the same two rows.

| Page                         | Back to | Primary action | Behind `⋯`                   | Toolbar                               |
| ---------------------------- | ------- | -------------- | ---------------------------- | ------------------------------------- |
| Poll detail                  | Polls   | Share ▾        | Rename, close/reopen, delete | Tabs, date range, export, grid tools  |
| Matches                      | —       | Add match      | Import matches               | Search, level, poll, date range, sync |
| Umpires                      | —       | Add umpire     | —                            | Search, level                         |
| Poll list                    | —       | New poll       | —                            | — (nothing to filter yet)             |
| Dashboard                    | —       | —              | —                            | —                                     |
| Settings                     | —       | —              | —                            | —                                     |
| Organizations, Users (admin) | —       | —              | —                            | —                                     |

Top-level pages have no `backHref`, so their header is title plus whatever
actions they have. A page with nothing to filter simply has no toolbar — the
pattern is not a template to fill in.

### Page subtitles are gone

Every list page used to carry a muted sentence under its title
("Create and manage availability polls for umpires"). They restated the page
name, cost a row each, and pushed the content down. The one that carried real
information — that umpires are added automatically when they answer a poll —
moved into the umpire table's empty state, where someone with no umpires will
actually read it.

### Where the header lives

Server component when the actions need no client state (poll list, dashboard,
settings, admin pages) — the header then renders instantly, outside `Suspense`.

Client component when a primary action opens a dialog (matches, umpires). The
page's `Suspense` fallback then pairs `PageHeaderSkeleton` with the table
skeleton so the header does not pop in after the data resolves.

## Still on the table

- **The inner `gap-20`.** The content wrapper still puts 80 px between its own
  direct children, so a page that renders several top-level sections spaces them
  far apart. Worth revisiting per page rather than changing globally.
- **Grid-native controls.** "Swap axes" only ever changes the grid's own shape;
  a spreadsheet would keep that control in the frozen corner cell rather than in
  the page toolbar. Worth revisiting if the toolbar grows again.
