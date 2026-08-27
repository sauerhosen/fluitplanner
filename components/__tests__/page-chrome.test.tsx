import { act, screen } from "@testing-library/react";
import { render } from "@/__tests__/helpers/render";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PageHeader } from "@/components/shared/page-header";
import { StickyToolbar } from "@/components/shared/sticky-toolbar";

/* ------------------------------------------------------------------ */
/*  IntersectionObserver stand-in                                      */
/* ------------------------------------------------------------------ */

type Cb = (entries: { isIntersecting: boolean }[]) => void;
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

/** Simulate the sentinel above the bar scrolling out of (or into) view. */
function setSentinelVisible(isIntersecting: boolean) {
  act(() => {
    observerCallback?.([{ isIntersecting }]);
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

    setSentinelVisible(false);

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

    setSentinelVisible(false);
    setSentinelVisible(true);

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
