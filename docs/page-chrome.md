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

`StickyToolbar` renders a 1 px sentinel directly above itself and watches it with
an `IntersectionObserver`. The sentinel leaves the viewport at exactly the moment
the bar starts sticking — no scroll maths, no threshold to tune, nothing to
recompute on resize. The compact identity shares the row with the toolbar's own
children rather than adding a second line, so sticking never changes the bar's
height and the page never jumps.

### Spacing above the page

`app/protected/layout.tsx` sets `gap-8` between the nav and the content wrapper,
which adds `p-5` of its own — 52 px of air under the navbar. It was `gap-20`
(100 px total), which made the emptiest band on the page the largest one. Keep
this gap in the layout; a page should not add its own top padding.

### The one layout constraint

`position: sticky` is measured against the nearest **scroll container**. The
authenticated layout wrapper (`app/protected/layout.tsx`) therefore uses
`overflow-x-clip`, not `overflow-hidden`: `clip` still contains the wide
assignment grid, but unlike `hidden` it does not create a scroll container, so
sticky children keep sticking to the viewport. If a toolbar ever sticks to the
wrong place — or scrolls away with the page — an ancestor grew an `overflow`
that is not `visible` or `clip`.

## Bringing other pages over

Same two rows, same components. Per page:

| Page        | Back to       | Primary action                          | Into `⋯`                     | Toolbar                              |
| ----------- | ------------- | --------------------------------------- | ---------------------------- | ------------------------------------ |
| Poll detail | Polls         | Share ▾                                 | Rename, close/reopen, delete | Tabs, date range, export, grid tools |
| Matches     | — (top level) | Add matches ▾ (upload / paste / manual) | Sync now, bulk delete        | Date range, filters, export          |
| Umpires     | — (top level) | Add umpire                              | Import, export               | Search, level filter                 |
| Poll list   | — (top level) | New poll                                | —                            | Status filter, date range            |
| Settings    | — (top level) | — (no primary)                          | —                            | Section tabs                         |

Top-level list pages have no `backHref`; they keep the same single identity row
and the same toolbar, so the two levels feel like one system.

### Checklist for migrating a page

1. Collapse every header block into one `PageHeader` row.
2. Pick the single primary action. Everything else goes in `⋯`.
3. Move tabs, filters and view toggles into a `StickyToolbar`.
4. Delete any `<Label>` that only labelled a row of buttons.
5. Set the page container to `gap-4`.
6. Check the stuck state at a 560 px-tall viewport — the compact identity should
   fade in and nothing should shift.

## Still on the table

- **The inner `gap-20`.** The content wrapper still puts 80 px between its own
  direct children, so a page that renders several top-level sections spaces them
  far apart. Worth revisiting per page rather than changing globally.
- **Grid-native controls.** "Swap axes" only ever changes the grid's own shape;
  a spreadsheet would keep that control in the frozen corner cell rather than in
  the page toolbar. Worth revisiting if the toolbar grows again.
