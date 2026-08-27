"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /**
   * Identity that fades in on the same line once the header above has scrolled
   * away — typically a back chevron plus a truncated title. It shares the row
   * with `children` rather than adding one, so sticking never shifts the page.
   */
  compact?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * A toolbar that sticks to the top of the viewport once you scroll past it,
 * and grows a compact page identity while it is stuck.
 *
 * The page header above it is free to scroll away: what you need while working
 * is the toolbar, and what you lose — knowing which record you are in — comes
 * back inside the bar. See `docs/page-chrome.md`.
 */
export function StickyToolbar({ compact, children, className }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof IntersectionObserver === "undefined") return;

    // The bar watches itself against a root shrunk by 1px at the top: while it
    // sits in the flow it is fully inside that root (ratio 1), and the moment
    // it pins to the top it pokes 1px outside it (ratio < 1).
    //
    // A separate sentinel element does not work here. Above the bar it would be
    // another flex item, so the parent's `gap` would sit between the two —
    // costing a row of dead space and flipping `stuck` a whole gap early.
    // Inside the bar it is glued to it, so it never crosses a threshold at all
    // and the observer fires exactly once, on setup.
    const observer = new IntersectionObserver(
      ([entry]) =>
        // The `top` guard keeps a bar that is still below the fold — outside
        // the root for the opposite reason — from reporting itself as stuck.
        setStuck(
          entry.intersectionRatio < 1 && entry.boundingClientRect.top <= 1,
        ),
      { threshold: [0, 1], rootMargin: "-1px 0px 0px 0px" },
    );
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={barRef}
      data-stuck={stuck ? "" : undefined}
      className={cn(
        "sticky top-0 z-30 -mx-5 flex items-center gap-2 overflow-x-auto px-5 py-2",
        stuck &&
          "border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85",
        className,
      )}
    >
      {compact && (
        <div
          className={cn(
            "flex min-w-0 items-center overflow-hidden transition-all motion-reduce:transition-none",
            stuck
              ? "max-w-[45%] opacity-100"
              : // -ml-2 cancels the bar's own gap-2, so a collapsed identity
                // leaves the toolbar flush with the header above it.
                "pointer-events-none -ml-2 max-w-0 opacity-0",
          )}
          aria-hidden={!stuck}
          // aria-hidden alone would leave the collapsed back link in the tab
          // order, dropping focus onto something invisible.
          inert={!stuck}
        >
          {compact}
        </div>
      )}
      {children}
    </div>
  );
}
