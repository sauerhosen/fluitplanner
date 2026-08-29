import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePinnedTableHeader } from "@/hooks/use-pinned-table-header";

/** Stub an element that reports a fixed box, the way layout would. */
function boxed(top: number, height: number): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ top, height, bottom: top + height }) as DOMRect;
  return el;
}

function setup(containerTop: number, containerHeight = 700, headerHeight = 80) {
  return {
    container: { current: boxed(containerTop, containerHeight) },
    header: { current: boxed(containerTop, headerHeight) },
  };
}

describe("usePinnedTableHeader", () => {
  const originalWidth = window.innerWidth;

  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalWidth,
    });
  });

  function width(value: number) {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value,
    });
  }

  it("stays at zero while the header is still on screen", () => {
    width(390);
    const { container, header } = setup(120);
    const { result } = renderHook(() =>
      usePinnedTableHeader(container, header),
    );

    expect(result.current).toBe(0);
  });

  it("follows the page once the header has scrolled past the top", () => {
    width(390);
    const { container, header } = setup(-200);
    const { result } = renderHook(() =>
      usePinnedTableHeader(container, header),
    );

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(result.current).toBe(200);
  });

  it("never outruns the last row", () => {
    width(390);
    const { container, header } = setup(-5000, 700, 80);
    const { result } = renderHook(() =>
      usePinnedTableHeader(container, header),
    );

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(result.current).toBe(620); // container height minus header height
  });

  it("does nothing above the sm breakpoint", () => {
    width(1280);
    const { container, header } = setup(-200);
    const { result } = renderHook(() =>
      usePinnedTableHeader(container, header),
    );

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(result.current).toBe(0);
  });
});
