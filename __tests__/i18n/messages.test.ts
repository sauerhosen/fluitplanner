import { describe, it, expect } from "vitest";
import en from "@/messages/en.json";
import nl from "@/messages/nl.json";

function getKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return getKeys(value as Record<string, unknown>, fullKey);
    }
    return [fullKey];
  });
}

describe("i18n message parity", () => {
  const enKeys = getKeys(en).sort();
  const nlKeys = getKeys(nl).sort();

  it("nl.json has all keys from en.json", () => {
    const missing = enKeys.filter((k) => !nlKeys.includes(k));
    expect(missing, `Missing in nl.json: ${missing.join(", ")}`).toEqual([]);
  });

  it("en.json has all keys from nl.json (no extra keys in nl)", () => {
    const extra = nlKeys.filter((k) => !enKeys.includes(k));
    expect(extra, `Extra in nl.json: ${extra.join(", ")}`).toEqual([]);
  });
});
