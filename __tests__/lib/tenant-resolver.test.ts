import { describe, it, expect } from "vitest";
import { resolveTenantFromHost } from "@/lib/tenant-resolver";

describe("resolveTenantFromHost", () => {
  it("extracts subdomain from production domain", () => {
    const result = resolveTenantFromHost("hic.fluiten.org", "fluiten.org");
    expect(result).toEqual({ type: "tenant", slug: "hic" });
  });

  it("returns root for the base domain", () => {
    const result = resolveTenantFromHost("fluiten.org", "fluiten.org");
    expect(result).toEqual({ type: "root" });
  });

  it("returns root for www subdomain", () => {
    const result = resolveTenantFromHost("www.fluiten.org", "fluiten.org");
    expect(result).toEqual({ type: "root" });
  });

  it("returns fallback for non-production domains (e.g. vercel.app)", () => {
    const result = resolveTenantFromHost(
      "my-project-abc123.vercel.app",
      "fluiten.org",
    );
    expect(result).toEqual({ type: "fallback" });
  });

  it("returns fallback for localhost", () => {
    const result = resolveTenantFromHost("localhost:3000", "fluiten.org");
    expect(result).toEqual({ type: "fallback" });
  });

  it("extracts subdomain from localhost with subdomain", () => {
    const result = resolveTenantFromHost("hic.localhost:3000", "fluiten.org");
    expect(result).toEqual({ type: "tenant", slug: "hic" });
  });
});
