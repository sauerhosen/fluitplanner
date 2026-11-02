import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  dayRangePredicate,
  useDateRangePresets,
} from "@/hooks/use-date-range-presets";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function presetsAt(ms: number) {
  vi.setSystemTime(new Date(ms));
  return renderHook(() => useDateRangePresets()).result.current;
}

describe("useDateRangePresets", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gives every instance the same range, whenever it mounted", () => {
    vi.useFakeTimers();
    const morning = new Date("2026-08-29T08:15:32.500Z").getTime();

    // The picker and the phone's tools menu are both mounted, milliseconds
    // apart. A range set in one is matched against the other's presets, so the
    // two have to agree exactly.
    const picker = presetsAt(morning);
    const menu = presetsAt(morning + 4321);

    for (const [i, preset] of picker.entries()) {
      expect(preset.range?.from?.getTime()).toBe(
        menu[i].range?.from?.getTime(),
      );
      expect(preset.range?.to?.getTime()).toBe(menu[i].range?.to?.getTime());
    }
  });

  it("starts every range at midnight", () => {
    vi.useFakeTimers();
    for (const preset of presetsAt(
      new Date("2026-08-29T14:47:11.900Z").getTime(),
    )) {
      if (!preset.range?.from) continue;
      expect(preset.range.from.getHours()).toBe(0);
      expect(preset.range.from.getMinutes()).toBe(0);
      expect(preset.range.from.getSeconds()).toBe(0);
      expect(preset.range.from.getMilliseconds()).toBe(0);
    }
  });

  it("offers an open-ended range from today for everything still to come", () => {
    vi.useFakeTimers();
    const upcoming = presetsAt(
      new Date("2026-11-02T14:47:11.900Z").getTime(),
    ).find((preset) => preset.label === "presetUpcoming");

    expect(upcoming?.range?.from?.getTime()).toBe(
      new Date(2026, 10, 2).getTime(),
    );
    expect(upcoming?.range?.to).toBeUndefined();
  });
});

describe("dayRangePredicate", () => {
  const nov2 = new Date(2026, 10, 2);
  const nov16 = new Date(2026, 10, 16);

  it("keeps every day when no range is picked", () => {
    expect(dayRangePredicate(undefined)("2020-01-01")).toBe(true);
  });

  it("keeps both ends of a closed range and nothing outside it", () => {
    const inRange = dayRangePredicate({ from: nov2, to: nov16 });
    expect(inRange("2026-11-01")).toBe(false);
    expect(inRange("2026-11-02")).toBe(true);
    expect(inRange("2026-11-16")).toBe(true);
    expect(inRange("2026-11-17")).toBe(false);
  });

  it("runs a range without an end open-ended, not as its first day alone", () => {
    const inRange = dayRangePredicate({ from: nov2, to: undefined });
    expect(inRange("2026-11-01")).toBe(false);
    expect(inRange("2026-11-02")).toBe(true);
    expect(inRange("2027-03-15")).toBe(true);
  });
});
