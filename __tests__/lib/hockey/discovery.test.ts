import { describe, it, expect } from "vitest";
import { pickClubFacilities } from "@/lib/hockey/discovery";
import type { ApiClubSummary, ApiFacility } from "@/lib/hockey/types";

const club: ApiClubSummary = {
  federation_reference_id: "HH11AS0",
  name: "Amsterdamsche Mixed Vereniging J",
  friendly_name: "AMVJ",
  city: "Amstelveen",
  type: "regular",
};

const facility = (id: number, name: string, city: string): ApiFacility => ({
  id,
  name,
  address: { city },
});

describe("pickClubFacilities", () => {
  it("prefers facilities whose name mentions the club", () => {
    const picked = pickClubFacilities(
      [
        facility(31, "Sportpark 'Het Loopveld' (VVV)", "Amstelveen"),
        facility(73, "Sportpark 'Het Loopveld' (AMVJ)", "Amstelveen"),
        facility(5, "Sportpark AMVJ-Noord", "Utrecht"),
      ],
      club,
    );

    expect(picked.map((f) => f.id)).toEqual([73, 5]);
  });

  it("matches a club named with an HC-style suffix by its core name", () => {
    const vvv: ApiClubSummary = {
      federation_reference_id: "HH11RD6",
      name: "Hockeyclub VVV",
      friendly_name: "VVV HC",
      city: "Amstelveen",
      type: "regular",
    };
    const picked = pickClubFacilities(
      [
        facility(962, "Pinoké hockey Dome", "Amstelveen"),
        facility(31, "Sportpark 'Het Loopveld' (VVV)", "Amstelveen"),
        facility(73, "Sportpark 'Het Loopveld' (AMVJ)", "Amstelveen"),
      ],
      vvv,
    );

    expect(picked.map((f) => f.id)).toEqual([31]);
  });

  it("falls back to the club's own city when no name matches", () => {
    const picked = pickClubFacilities(
      [
        facility(31, "Sportpark 'Het Loopveld' (VVV)", "Amstelveen"),
        facility(8, "Sportpark Groenewoud", "Spijkenisse"),
      ],
      club,
    );

    expect(picked.map((f) => f.id)).toEqual([31]);
  });

  it("caps how many venues one club can cost upstream", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      facility(i, `Veld ${i}`, "Amstelveen"),
    );

    expect(pickClubFacilities(many, club).length).toBeLessThanOrEqual(5);
  });

  it("tolerates null upstream fields", () => {
    const picked = pickClubFacilities(
      [{ id: 1, name: null, address: null } as unknown as ApiFacility],
      club,
    );

    expect(picked).toEqual([]);
  });
});
