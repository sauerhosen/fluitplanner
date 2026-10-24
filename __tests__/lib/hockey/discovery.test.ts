import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchFacilityMatches,
  fetchTeamPouleFetchedAt,
  pickClubFacilities,
} from "@/lib/hockey/discovery";
import type {
  ApiClubSummary,
  ApiFacility,
  ApiMatchSummary,
} from "@/lib/hockey/types";

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

describe("pickClubFacilities — names and the cap", () => {
  it("strips an H.C. prefix written with dots", () => {
    const tilburg: ApiClubSummary = {
      federation_reference_id: "T1",
      name: "H.C. Tilburg",
      friendly_name: "H.C. Tilburg",
      city: "Elsewhere",
      type: "regular",
    };
    const picked = pickClubFacilities(
      [facility(4, "Sportpark Oude Warande (Tilburg)", "Tilburg")],
      tilburg,
    );

    expect(picked.map((f) => f.id)).toEqual([4]);
  });

  it("keeps the club's own city first when the cap cuts name matches", () => {
    const rotterdam: ApiClubSummary = {
      federation_reference_id: "R1",
      name: "HC Rotterdam",
      friendly_name: "Rotterdam",
      city: "Rotterdam",
      type: "regular",
    };
    const elsewhere = Array.from({ length: 6 }, (_, i) =>
      facility(i, `Rotterdamseweg ${i}`, "Delft"),
    );
    const picked = pickClubFacilities(
      [
        ...elsewhere,
        facility(99, "Sportpark Hazelaarweg (Rotterdam)", "Rotterdam"),
      ],
      rotterdam,
    );

    expect(picked[0].id).toBe(99);
  });
});

describe("fetchFacilityMatches", () => {
  function fakeSupabase(): SupabaseClient {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => ({ data: null }),
      upsert: async () => ({ error: null }),
    };
    return { from: () => query } as unknown as SupabaseClient;
  }

  it("fills in the facility as the venue of a match without a location", async () => {
    const match = {
      id: 1,
      date: "2099-09-27T14:00:00+02:00",
      status: "scheduled",
      home: { id: 1, name: "VVV D3" },
      away: { id: 2, name: "AMVJ D3" },
    } as ApiMatchSummary;
    const get = async () => ({
      id: 31,
      name: "Sportpark 'Het Loopveld' (VVV)",
      matches: [
        match,
        {
          ...match,
          id: 2,
          location: { facility: { name: "Own name" }, field: { name: "2" } },
        },
      ],
    });

    const matches = await fetchFacilityMatches(
      { supabase: fakeSupabase(), client: { get } as never },
      31,
      "2099-09-27",
    );

    expect(matches.map((m) => m.location?.facility?.name)).toEqual([
      "Sportpark 'Het Loopveld' (VVV)",
      "Own name",
    ]);
  });
});

describe("fetchTeamPouleFetchedAt", () => {
  function fakeSupabase(
    rows: Array<{ cache_key: string; fetched_at: string }> | null,
    error: { message: string } | null = null,
  ): { client: SupabaseClient; keys: () => unknown } {
    let asked: unknown;
    const query = {
      select: () => query,
      in: async (_column: string, keys: unknown) => {
        asked = keys;
        return { data: rows, error };
      },
    };
    return {
      client: { from: () => query } as unknown as SupabaseClient,
      keys: () => asked,
    };
  }

  it("maps each team to when its poule was last fetched", async () => {
    const supabase = fakeSupabase([
      { cache_key: "poule-team:500:774", fetched_at: "2026-10-24T04:30:00Z" },
    ]);

    const fetchedAt = await fetchTeamPouleFetchedAt(
      { supabase: supabase.client, client: { get: async () => null } as never },
      [
        { pouleId: 500, teamId: 774 },
        { pouleId: 600, teamId: 900 },
      ],
    );

    expect(supabase.keys()).toEqual([
      "poule-team:500:774",
      "poule-team:600:900",
    ]);
    expect(fetchedAt).toEqual(
      new Map([[774, new Date("2026-10-24T04:30:00Z").getTime()]]),
    );
  });

  it("returns no ages when the cache cannot be read", async () => {
    const supabase = fakeSupabase(null, { message: "db down" });

    const fetchedAt = await fetchTeamPouleFetchedAt(
      { supabase: supabase.client, client: { get: async () => null } as never },
      [{ pouleId: 500, teamId: 774 }],
    );

    expect(fetchedAt.size).toBe(0);
  });
});
