// Types for the unofficial Hockey.nl Match Center API (app.hockeyweerelt.nl).
// See docs/hockey-match-center-api.md §9. Fields can be absent or null depending
// on endpoint and match type — treat every payload as untrusted input.

export type ApiMatchStatus =
  | "discontinued"
  | "cancelled"
  | "final"
  | "result"
  | "announced"
  | "live"
  | "scheduled"
  | "expired"
  | "unknown";

export type ApiTeamSummary = {
  id: number;
  name: string;
  short_name?: string | null;
  hockey_type?: string | null;
  federation_reference_id?: string | null;
  recent_poule_id?: number | null;
};

export type ApiClubSummary = {
  federation_reference_id: string;
  name: string;
  friendly_name: string;
  city: string;
  logo?: string | null;
  type: string;
};

export type ApiClubDetail = ApiClubSummary & {
  teams: ApiTeamSummary[];
};

export type ApiMatchLocation = {
  facility?: { name: string | null; address?: string | null } | null;
  field?: { name: string | null; type?: string | null } | null;
} | null;

export type ApiMatchSummary = {
  id: number;
  date: string;
  status: ApiMatchStatus | string;
  home: ApiTeamSummary;
  away: ApiTeamSummary;
  location?: ApiMatchLocation;
  poule_id?: number | null;
  poule_name?: string | null;
  competition_name?: string | null;
  remarks?: string | null;
  round?: number | null;
};

export type ApiTeamPouleResponse = {
  team: ApiTeamSummary & {
    poules: Array<{ id: number; name: string }>;
  };
  poule: {
    id: number;
    name: string;
    matches: ApiMatchSummary[];
  };
};

/** Internal normalized shape produced from an ApiMatchSummary. */
export type NormalizedFixture = {
  matchId: number;
  start: string;
  timeConfirmed: boolean;
  status: string;
  homeTeamName: string;
  awayTeamName: string;
  competition: string | null;
  venue: string | null;
  field: string | null;
};

export type HockeyCredentials = {
  uuid: string;
  token: string;
};

export type CredentialStore = {
  load(): Promise<HockeyCredentials | null>;
  save(credentials: HockeyCredentials): Promise<void>;
};

export type HockeyClient = {
  get<T>(endpoint: string): Promise<T>;
};
