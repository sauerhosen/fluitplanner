import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/headers
const mockGet = vi.fn();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: mockGet,
  })),
}));

describe("getTenantId", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("returns organization_id from x-organization-id header", async () => {
    mockGet.mockImplementation((name: string) => {
      if (name === "x-organization-id") return "org-uuid-123";
      return null;
    });
    const { getTenantId } = await import("@/lib/tenant");
    const result = await getTenantId();
    expect(result).toBe("org-uuid-123");
  });

  it("returns null when header is not set", async () => {
    mockGet.mockReturnValue(null);
    const { getTenantId } = await import("@/lib/tenant");
    const result = await getTenantId();
    expect(result).toBeNull();
  });
});

describe("getTenantSlug", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("returns slug from x-organization-slug header", async () => {
    mockGet.mockImplementation((name: string) => {
      if (name === "x-organization-slug") return "hic";
      return null;
    });
    const { getTenantSlug } = await import("@/lib/tenant");
    const result = await getTenantSlug();
    expect(result).toBe("hic");
  });
});

describe("isRootDomain", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("returns true when x-is-root-domain header is set", async () => {
    mockGet.mockImplementation((name: string) => {
      if (name === "x-is-root-domain") return "true";
      return null;
    });
    const { isRootDomain } = await import("@/lib/tenant");
    const result = await isRootDomain();
    expect(result).toBe(true);
  });

  it("returns false when header is not set", async () => {
    mockGet.mockReturnValue(null);
    const { isRootDomain } = await import("@/lib/tenant");
    const result = await isRootDomain();
    expect(result).toBe(false);
  });
});

describe("requireTenantId", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("returns organization_id when present", async () => {
    mockGet.mockImplementation((name: string) => {
      if (name === "x-organization-id") return "org-uuid-123";
      return null;
    });
    const { requireTenantId } = await import("@/lib/tenant");
    const result = await requireTenantId();
    expect(result).toBe("org-uuid-123");
  });

  it("throws when organization_id is not present", async () => {
    mockGet.mockReturnValue(null);
    const { requireTenantId } = await import("@/lib/tenant");
    await expect(requireTenantId()).rejects.toThrow("No tenant context");
  });
});
