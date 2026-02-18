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
