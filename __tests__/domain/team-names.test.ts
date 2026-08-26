import { describe, it, expect } from "vitest";
import { stripClubPrefix } from "@/lib/domain/team-names";

describe("stripClubPrefix", () => {
  const club = "VVV HC";

  it("strips a plain club prefix from a home team", () => {
    expect(stripClubPrefix("VVV HC MO16-1", club)).toBe("MO16-1");
  });

  it("strips a combination club prefix", () => {
    expect(stripClubPrefix("AMVJ/VVV HC JO14-1", club)).toBe("JO14-1");
  });

  it("leaves opposing clubs untouched", () => {
    expect(stripClubPrefix("Amsterdam MO14-1", club)).toBe("Amsterdam MO14-1");
    expect(stripClubPrefix("Xenios MO16-1", club)).toBe("Xenios MO16-1");
    expect(stripClubPrefix("Zoetermeer JO18-1", club)).toBe(
      "Zoetermeer JO18-1",
    );
  });

  it("does not strip a club name that appears mid-name without a slash", () => {
    expect(stripClubPrefix("Oud VVV HC MO16-1", club)).toBe(
      "Oud VVV HC MO16-1",
    );
  });

  it("matches case-insensitively", () => {
    expect(stripClubPrefix("vvv hc MO16-1", club)).toBe("MO16-1");
  });

  it("returns the original when stripping would leave nothing", () => {
    expect(stripClubPrefix("VVV HC", club)).toBe("VVV HC");
    expect(stripClubPrefix("AMVJ/VVV HC ", club)).toBe("AMVJ/VVV HC ");
  });

  it("returns the original when no club name is known", () => {
    expect(stripClubPrefix("VVV HC MO16-1", null)).toBe("VVV HC MO16-1");
    expect(stripClubPrefix("VVV HC MO16-1", "")).toBe("VVV HC MO16-1");
  });

  it("treats regex metacharacters in the club name literally", () => {
    expect(stripClubPrefix("H.C. Klein MO16-1", "H.C. Klein")).toBe("MO16-1");
    expect(stripClubPrefix("HXCXKlein MO16-1", "H.C. Klein")).toBe(
      "HXCXKlein MO16-1",
    );
  });

  it("handles surrounding whitespace", () => {
    expect(stripClubPrefix("  VVV HC MO16-1  ", club)).toBe("MO16-1");
  });
});
