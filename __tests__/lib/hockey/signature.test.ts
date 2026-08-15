import { describe, it, expect } from "vitest";
import { sanitizeForSignature, buildSignature } from "@/lib/hockey/signature";

const UUID = "12345678-abcd-4ef0-9876-0123456789ab";
const TIMESTAMP = 1755244800;

describe("sanitizeForSignature", () => {
  it("strips brackets from filter query keys and joins pairs without separators", () => {
    const { path, query } = sanitizeForSignature(
      "/poules/180863?filter[dateStart]=2026-09-27&filter[dateEnd]=2026-10-05",
    );
    expect(path).toBe("/poules/180863");
    expect(query).toBe("filterdateStart=2026-09-27filterdateEnd=2026-10-05");
  });

  it("returns an empty query string when there are no query params", () => {
    const { path, query } = sanitizeForSignature("/clubs");
    expect(path).toBe("/clubs");
    expect(query).toBe("");
  });

  it("removes disallowed characters from the path", () => {
    const { path } = sanitizeForSignature("/clubs/HH11PD0");
    expect(path).toBe("/clubs/HH11PD0");
  });

  it("strips characters outside the allowed set from the path", () => {
    // percent-encoded and special characters are removed, not decoded
    const { path } = sanitizeForSignature("/clubs/A_B.C%20D");
    expect(path).toBe("/clubs/ABC20D");
  });

  it("preserves query pair order", () => {
    const { query } = sanitizeForSignature("/x?b=2&a=1");
    expect(query).toBe("b=2a=1");
  });
});

describe("buildSignature", () => {
  it("matches the documented algorithm for a bracketed date-filter endpoint", () => {
    // Input string: timestamp + sanitized path + concatenated query pairs + reversed UUID
    // 1755244800/poules/180863filterdateStart=2026-09-27filterdateEnd=2026-10-05ba9876543210-6789-0fe4-dcba-87654321
    const signature = buildSignature({
      endpoint:
        "/poules/180863?filter[dateStart]=2026-09-27&filter[dateEnd]=2026-10-05",
      uuid: UUID,
      timestamp: TIMESTAMP,
    });
    expect(signature).toBe("19010b478fc913fd88dab32fcc2c4b5b6278d8a8");
  });

  it("signs an endpoint without query params", () => {
    const signature = buildSignature({
      endpoint: "/clubs",
      uuid: UUID,
      timestamp: TIMESTAMP,
    });
    expect(signature).toBe("f1a9764787172f7846e26ed9a8ea24ec3061d4c2");
  });

  it("produces lowercase hex", () => {
    const signature = buildSignature({
      endpoint: "/clubs",
      uuid: UUID,
      timestamp: TIMESTAMP,
    });
    expect(signature).toMatch(/^[0-9a-f]{40}$/);
  });

  it("changes when the query order changes", () => {
    const a = buildSignature({
      endpoint: "/x?a=1&b=2",
      uuid: UUID,
      timestamp: TIMESTAMP,
    });
    const b = buildSignature({
      endpoint: "/x?b=2&a=1",
      uuid: UUID,
      timestamp: TIMESTAMP,
    });
    expect(a).not.toBe(b);
  });
});
