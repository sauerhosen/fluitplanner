"use client";

import { useState, useMemo, useCallback } from "react";

export function useSelection<T>(items: T[], getId: (item: T) => string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === items.length) return new Set();
      return new Set(items.map(getId));
    });
  }, [items, getId]);

  const toggleGroup = useCallback((groupIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = groupIds.every((id) => next.has(id));
      if (allSelected) {
        groupIds.forEach((id) => next.delete(id));
      } else {
        groupIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const allChecked = useMemo(
    () => items.length > 0 && selectedIds.size === items.length,
    [items.length, selectedIds.size],
  );

  const someChecked = useMemo(
    () => selectedIds.size > 0 && !allChecked,
    [selectedIds.size, allChecked],
  );

  const isGroupAllSelected = useCallback(
    (groupIds: string[]) => groupIds.every((id) => selectedIds.has(id)),
    [selectedIds],
  );

  const isGroupSomeSelected = useCallback(
    (groupIds: string[]) =>
      groupIds.some((id) => selectedIds.has(id)) &&
      !groupIds.every((id) => selectedIds.has(id)),
    [selectedIds],
  );

  return {
    selectedIds,
    toggleSelection,
    toggleAll,
    toggleGroup,
    clearSelection,
    allChecked,
    someChecked,
    isGroupAllSelected,
    isGroupSomeSelected,
  };
}
