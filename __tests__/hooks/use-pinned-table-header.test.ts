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

function setup(tableTop: number, tableHeight = 700, headerHeight = 80) {
  return {
    table: { current: boxed(tableTop, tableHeight) },
    header: { current: boxed(tableTop, headerHeight) },
  };
}

function scroll() {
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

describe("usePinnedTableHeader", () => {
  beforeEach(() => {
    // Runs the frame at once. It returns 0, the "no frame pending" value the
    // hook resets to, since the callback has already run by the time the id
    // would be stored — a non-zero id would block every later frame.
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("stays at zero while the header is still on screen", () => {
    const { table, header } = setup(120);
    renderHook(() => usePinnedTableHeader(table, header));

    expect(header.current.style.top).toBe("0px");
  });

  it("follows the page once the header has scrolled past the top", () => {
    const { table, header } = setup(-200);
    renderHook(() => usePinnedTableHeader(table, header));
    scroll();

    expect(header.current.style.top).toBe("200px");
  });

  it("never outruns the last row", () => {
    const { table, header } = setup(-5000, 700, 80);
    renderHook(() => usePinnedTableHeader(table, header));
    scroll();

    expect(header.current.style.top).toBe("620px"); // table minus header
  });

  it("pins on desktop too, where a long umpire list scrolls the page", () => {
    vi.stubGlobal("innerWidth", 1280);
    const { table, header } = setup(-200);
    renderHook(() => usePinnedTableHeader(table, header));
    scroll();

    expect(header.current.style.top).toBe("200px");
  });

  it("starts under a stuck toolbar", () => {
    const toolbar = boxed(0, 56);
    toolbar.setAttribute("data-stuck", "");
    document.body.appendChild(toolbar);
    const { table, header } = setup(-200);
    renderHook(() => usePinnedTableHeader(table, header));
    scroll();

    expect(header.current.style.top).toBe("256px");
  });

  it("re-measures when the toolbar becomes stuck after the scroll", async () => {
    const toolbar = boxed(0, 56);
    document.body.appendChild(toolbar);
    const { table, header } = setup(-200);
    renderHook(() => usePinnedTableHeader(table, header));
    scroll();
    expect(header.current.style.top).toBe("200px");

    toolbar.setAttribute("data-stuck", "");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(header.current.style.top).toBe("256px");
  });

  it("leaves the header alone while disabled, and measures when enabled", () => {
    const { table, header } = setup(-200);
    const { rerender } = renderHook(
      ({ enabled }) => usePinnedTableHeader(table, header, enabled),
      { initialProps: { enabled: false } },
    );
    scroll();
    expect(header.current.style.top).toBe("");

    rerender({ enabled: true });

    expect(header.current.style.top).toBe("200px");
  });
});
