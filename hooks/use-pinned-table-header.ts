"use client";

import { useEffect, useState, type RefObject } from "react";

/** Below this width the grid scrolls sideways and the header has to be pinned. */
const PIN_BELOW = 640;

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
 * applied as `top` to a relatively positioned header. It is clamped to the
 * table, so the header rides down with the last row instead of escaping below
 * it, and it starts under whatever sticky toolbar is currently pinned.
 *
 * Above `sm` it stays 0: the whole grid fits, and the header scrolls away with
 * the page as it always has.
 */
export function usePinnedTableHeader(
  containerRef: RefObject<HTMLElement | null>,
  headerRef: RefObject<HTMLElement | null>,
): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let frame = 0;

    const measure = () => {
      frame = 0;
      const container = containerRef.current;
      const header = headerRef.current;
      if (!container || !header) return;

      if (window.innerWidth >= PIN_BELOW) {
        setOffset(0);
        return;
      }

      // A toolbar only carries `data-stuck` while it is pinned, so an unstuck
      // page pins the header to the top of the viewport instead.
      const toolbar = document.querySelector("[data-stuck]");
      const pinTo = toolbar ? toolbar.getBoundingClientRect().bottom : 0;

      const { top, height } = container.getBoundingClientRect();
      const room = height - header.getBoundingClientRect().height;
      setOffset(Math.min(Math.max(pinTo - top, 0), Math.max(room, 0)));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [containerRef, headerRef]);

  return offset;
}
