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
 * back inside the bar. See `docs/design/page-chrome.md`.
 */
export function StickyToolbar({ compact, children, className }: Props) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;

    // The sentinel sits directly above the bar in normal flow, so it leaves the
    // viewport exactly when the bar starts sticking. No scroll maths, no
    // threshold to tune, and nothing to recompute on resize.
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden className="h-px" />
      <div
        data-stuck={stuck ? "" : undefined}
        className={cn(
          "sticky top-0 z-30 -mx-4 flex items-center gap-2 overflow-x-auto px-4 py-2 sm:-mx-5 sm:px-5",
          stuck &&
            "border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85",
          className,
        )}
      >
        {compact && (
          <div
            className={cn(
              "flex min-w-0 items-center transition-all motion-reduce:transition-none",
              stuck
                ? "max-w-[45%] opacity-100"
                : // -ml-2 cancels the bar's own gap-2, so a collapsed identity
                  // leaves the toolbar flush with the header above it.
                  "pointer-events-none -ml-2 max-w-0 opacity-0",
            )}
            aria-hidden={!stuck}
          >
            {compact}
          </div>
        )}
        {children}
      </div>
    </>
  );
}
