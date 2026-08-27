import { act, screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PageHeader } from "@/components/shared/page-header";
import { StickyToolbar } from "@/components/shared/sticky-toolbar";

/* ------------------------------------------------------------------ */
/*  IntersectionObserver stand-in                                      */
/* ------------------------------------------------------------------ */

type Entry = {
  intersectionRatio: number;
  boundingClientRect: { top: number };
};
type Cb = (entries: Entry[]) => void;
let observerCallback: Cb | null = null;
const disconnect = vi.fn();

class FakeObserver {
  constructor(cb: Cb) {
    observerCallback = cb;
  }
  observe() {}
  disconnect() {
    disconnect();
  }
}

beforeEach(() => {
  observerCallback = null;
  disconnect.mockClear();
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * The bar observes itself against a root shrunk by 1px at the top: fully inside
 * it (ratio 1) while it sits in the flow, poking out of it (ratio < 1) once it
 * pins. Pinned means `top` is at the fold; a bar you have not scrolled to yet
 * is also outside the root, but with `top` far below it.
 */
function setPinned(pinned: boolean) {
  act(() => {
    observerCallback?.([
      pinned
        ? { intersectionRatio: 0.98, boundingClientRect: { top: 0 } }
        : { intersectionRatio: 1, boundingClientRect: { top: 120 } },
    ]);
  });
}

describe("PageHeader", () => {
  it("puts identity, state and actions on one row", () => {
    render(
      <PageHeader
        backHref="/protected/polls"
        backLabel="Polls"
        title={<h1>Seizoen &apos;26-&apos;27</h1>}
        status={<span>Open</span>}
        actions={<button type="button">Share</button>}
      />,
    );

    expect(screen.getByRole("link", { name: "Polls" })).toHaveAttribute(
      "href",
      "/protected/polls",
    );
    expect(
      screen.getByRole("heading", { name: "Seizoen '26-'27" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  });

  it("leaves the back link out on a top-level page", () => {
    render(<PageHeader title={<h1>Umpires</h1>} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("StickyToolbar", () => {
  it("hides the compact identity while the header above is still visible", () => {
    render(
      <StickyToolbar compact={<span>Seizoen &apos;26-&apos;27</span>}>
        <button type="button">Export</button>
      </StickyToolbar>,
    );

    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    // Rendered but collapsed, so it can fade in without shifting the row.
    expect(screen.getByText("Seizoen '26-'27").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("reveals the compact identity once the toolbar sticks", () => {
    render(
      <StickyToolbar compact={<span>Seizoen &apos;26-&apos;27</span>}>
        <button type="button">Export</button>
      </StickyToolbar>,
    );

    setPinned(true);

    const holder = screen.getByText("Seizoen '26-'27").parentElement!;
    expect(holder).not.toHaveAttribute("aria-hidden", "true");
    expect(holder.className).toContain("opacity-100");
  });

  it("hides it again when you scroll back to the top", () => {
    render(
      <StickyToolbar compact={<span>Seizoen &apos;26-&apos;27</span>}>
        <button type="button">Export</button>
      </StickyToolbar>,
    );

    setPinned(true);
    setPinned(false);

    expect(screen.getByText("Seizoen '26-'27").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("does not call a bar that is still below the fold stuck", () => {
    render(
      <StickyToolbar compact={<span>Seizoen &apos;26-&apos;27</span>}>
        <button type="button">Export</button>
      </StickyToolbar>,
    );

    // Outside the root, but below the viewport — nobody has scrolled to it yet.
    act(() => {
      observerCallback?.([
        { intersectionRatio: 0, boundingClientRect: { top: 400 } },
      ]);
    });

    expect(screen.getByText("Seizoen '26-'27").parentElement).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("stops observing when unmounted", () => {
    const { unmount } = render(
      <StickyToolbar>
        <button type="button">Export</button>
      </StickyToolbar>,
    );

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });
});
