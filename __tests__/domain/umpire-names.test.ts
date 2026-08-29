import { describe, it, expect } from "vitest";
import { shortenUmpireName } from "@/lib/domain/umpire-names";

describe("shortenUmpireName", () => {
  it("keeps the given name and abbreviates a single-word surname", () => {
    expect(shortenUmpireName("Bart Takkenberg")).toBe("Bart T.");
    expect(shortenUmpireName("Bas Rupert")).toBe("Bas R.");
    expect(shortenUmpireName("Femke Ploeger")).toBe("Femke P.");
  });

  it("keeps the casing of a tussenvoegsel in a compound surname", () => {
    expect(shortenUmpireName("Carel de Steenwinkel")).toBe("Carel dS");
    expect(shortenUmpireName("Anne van der Berg")).toBe("Anne vdB");
    expect(shortenUmpireName("Piet Van Dijk")).toBe("Piet VD");
  });

  it("treats a hyphenated surname as one word", () => {
    expect(shortenUmpireName("Marieke Jansen-Bakker")).toBe("Marieke J.");
  });

  it("leaves a single-word name alone", () => {
    expect(shortenUmpireName("Okke")).toBe("Okke");
  });

  it("shortens every surname part after a compound given name", () => {
    expect(shortenUmpireName("Jan Willem Kooij")).toBe("Jan W.K.");
  });

  it("handles surrounding and repeated whitespace", () => {
    expect(shortenUmpireName("  Bart   Takkenberg ")).toBe("Bart T.");
  });

  it("returns an empty string unchanged", () => {
    expect(shortenUmpireName("")).toBe("");
  });
});
