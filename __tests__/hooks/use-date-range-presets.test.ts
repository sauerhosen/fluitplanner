import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useDateRangePresets } from "@/hooks/use-date-range-presets";

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
});
