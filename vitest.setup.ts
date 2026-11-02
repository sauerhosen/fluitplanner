import "@testing-library/jest-dom/vitest";

// Polyfills for Radix UI components in jsdom (skip in non-jsdom environments)
if (typeof Element === "undefined") {
  // @ts-expect-error — noop exports for node environment
  globalThis.Element = { prototype: {} };
}
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// jsdom has no layout, so no media query ever matches; components that branch
// on one render their narrow-screen form under test.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
