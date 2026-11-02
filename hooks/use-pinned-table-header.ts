"use client";

import { useEffect, type RefObject } from "react";

/**
 * Keep a sideways-scrolling table's header visible while the page scrolls.
 *
 * `position: sticky` cannot do this on its own: a sticky header pins to the
 * scrollport of its nearest overflow ancestor, and this table's ancestor is a
 * horizontal scroller that never moves vertically. Capping that ancestor's
 * height would give it a vertical scrollport, but then the page and the grid
 * each own a scrollbar and the grid ends mid-row in the middle of the page.
 *
 * So the offset is computed by hand from the page's own scroll position, and
 * written straight to the relatively positioned header's `top`. It is clamped
 * to the table, so the header rides down with the last row instead of escaping
 * below it, and it starts under whatever sticky toolbar is currently pinned.
 *
 * The offset is written to the element rather than held in React state: it
 * changes every scroll frame, and state would re-render the whole grid each
 * time.
 *
 * It applies at every width: a phone needs it because the grid scrolls
 * sideways, and a desktop with a long umpire list needs it because the rows
 * outlast the viewport.
 *
 * `tableRef` must be the table itself, not its scroller: the scroller's box
 * includes its padding and horizontal scrollbar, and a header clamped to that
 * would poke past the scrollport and give the scroller a vertical scrollbar.
 * Pass `enabled = false` while the table is not rendered, so it is measured
 * afresh when it comes back.
 */
export function usePinnedTableHeader(
  tableRef: RefObject<HTMLElement | null>,
  headerRef: RefObject<HTMLElement | null>,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const table = tableRef.current;
      const header = headerRef.current;
      if (!table || !header) return;

      // A toolbar only carries `data-stuck` while it is pinned, so an unstuck
      // page pins the header to the top of the viewport instead.
      const toolbar = document.querySelector("[data-stuck]");
      const pinTo = toolbar ? toolbar.getBoundingClientRect().bottom : 0;

      const { top, height } = table.getBoundingClientRect();
      const room = height - header.getBoundingClientRect().height;
      const offset = Math.min(Math.max(pinTo - top, 0), Math.max(room, 0));
      header.style.top = `${offset}px`;
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // The toolbar learns it is stuck from an IntersectionObserver, which can
    // report after the scroll frame that measured — a jump (End, scroll
    // restoration) would otherwise leave the header under the toolbar until
    // the next scroll.
    const stuck = new MutationObserver(schedule);
    stuck.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-stuck"],
      subtree: true,
    });
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      stuck.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [tableRef, headerRef, enabled]);
}
