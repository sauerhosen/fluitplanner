"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a CSS media query matches, kept in sync as the window resizes.
 *
 * The server cannot know the viewport, so it renders `serverDefault` and the
 * browser corrects it right after hydration. Pick the default that suits the
 * most common screen, so most visitors never see the swap.
 */
export function useMediaQuery(query: string, serverDefault: boolean): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverDefault,
  );
}
