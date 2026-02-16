import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useSelection } from "@/hooks/use-selection";

const items = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
  { id: "c", name: "Charlie" },
];

const getId = (item: { id: string }) => item.id;

describe("useSelection", () => {
  it("starts with nothing selected", () => {
    const { result } = renderHook(() => useSelection(items, getId));
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.allChecked).toBe(false);
    expect(result.current.someChecked).toBe(false);
  });

  it("toggleSelection adds and removes individual items", () => {
    const { result } = renderHook(() => useSelection(items, getId));

    act(() => result.current.toggleSelection("a"));
    expect(result.current.selectedIds.has("a")).toBe(true);
    expect(result.current.someChecked).toBe(true);
    expect(result.current.allChecked).toBe(false);

    act(() => result.current.toggleSelection("a"));
    expect(result.current.selectedIds.has("a")).toBe(false);
  });

  it("toggleAll selects all when none selected", () => {
    const { result } = renderHook(() => useSelection(items, getId));

    act(() => result.current.toggleAll());
    expect(result.current.selectedIds.size).toBe(3);
    expect(result.current.allChecked).toBe(true);
    expect(result.current.someChecked).toBe(false);
  });

  it("toggleAll deselects all when all selected", () => {
    const { result } = renderHook(() => useSelection(items, getId));

    act(() => result.current.toggleAll());
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("clearSelection empties the set", () => {
    const { result } = renderHook(() => useSelection(items, getId));

    act(() => result.current.toggleAll());
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("toggleGroup selects all in group when none selected", () => {
    const { result } = renderHook(() => useSelection(items, getId));

    act(() => result.current.toggleGroup(["a", "b"]));
    expect(result.current.selectedIds.has("a")).toBe(true);
    expect(result.current.selectedIds.has("b")).toBe(true);
    expect(result.current.selectedIds.has("c")).toBe(false);
  });

  it("toggleGroup deselects all in group when all selected", () => {
    const { result } = renderHook(() => useSelection(items, getId));

    act(() => result.current.toggleGroup(["a", "b"]));
    act(() => result.current.toggleGroup(["a", "b"]));
    expect(result.current.selectedIds.has("a")).toBe(false);
    expect(result.current.selectedIds.has("b")).toBe(false);
  });

  it("toggleGroup selects remaining when some in group selected", () => {
    const { result } = renderHook(() => useSelection(items, getId));

    act(() => result.current.toggleSelection("a"));
    act(() => result.current.toggleGroup(["a", "b"]));
    expect(result.current.selectedIds.has("a")).toBe(true);
    expect(result.current.selectedIds.has("b")).toBe(true);
  });

  it("isGroupAllSelected returns true when all group items selected", () => {
    const { result } = renderHook(() => useSelection(items, getId));

    act(() => result.current.toggleGroup(["a", "b"]));
    expect(result.current.isGroupAllSelected(["a", "b"])).toBe(true);
    expect(result.current.isGroupAllSelected(["a", "b", "c"])).toBe(false);
  });

  it("isGroupSomeSelected returns true for partial selection", () => {
    const { result } = renderHook(() => useSelection(items, getId));

    act(() => result.current.toggleSelection("a"));
    expect(result.current.isGroupSomeSelected(["a", "b"])).toBe(true);
    expect(result.current.isGroupSomeSelected(["a"])).toBe(false);
  });

  it("returns correct state for empty items array", () => {
    const { result } = renderHook(() => useSelection([], getId));
    expect(result.current.allChecked).toBe(false);
    expect(result.current.someChecked).toBe(false);
  });

  it("cleans up stale selections when items change", () => {
    const { result, rerender } = renderHook(
      ({ items }) => useSelection(items, getId),
      { initialProps: { items } },
    );

    act(() => result.current.toggleAll());
    expect(result.current.selectedIds.size).toBe(3);

    // Remove item "b" from the list
    rerender({ items: [items[0], items[2]] });
    expect(result.current.selectedIds.size).toBe(2);
    expect(result.current.selectedIds.has("b")).toBe(false);
    expect(result.current.selectedIds.has("a")).toBe(true);
    expect(result.current.selectedIds.has("c")).toBe(true);
  });

  it("toggleAll checks by ID membership not count", () => {
    const { result, rerender } = renderHook(
      ({ items }) => useSelection(items, getId),
      { initialProps: { items } },
    );

    // Select a and b (2 items)
    act(() => result.current.toggleSelection("a"));
    act(() => result.current.toggleSelection("b"));

    // Change items to only have 2 items — count matches but IDs differ
    const newItems = [
      { id: "b", name: "Beta" },
      { id: "c", name: "Charlie" },
    ];
    rerender({ items: newItems });

    // After cleanup: only "b" remains selected (1 of 2), so toggleAll should select all
    act(() => result.current.toggleAll());
    expect(result.current.selectedIds.size).toBe(2);
    expect(result.current.selectedIds.has("b")).toBe(true);
    expect(result.current.selectedIds.has("c")).toBe(true);
  });
});
