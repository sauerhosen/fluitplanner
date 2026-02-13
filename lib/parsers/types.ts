import type { ManagedTeam } from "@/lib/types/domain";

export type RawRow = Record<string, string>;

export type ParsedMatch = {
  date: string;
  start_time: string | null;
  home_team: string;
  away_team: string;
  venue: string | null;
  field: string | null;
  competition: string | null;
  required_level: 1 | 2 | 3;
};

export type ParseResult = {
  matches: ParsedMatch[];
  skippedCount: number;
  errors: string[];
};

export type MapperOptions = {
  managedTeams: ManagedTeam[];
};
