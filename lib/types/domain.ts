export type Match = {
  id: string;
  date: string;
  start_time: string | null;
  home_team: string;
  away_team: string;
  competition: string | null;
  venue: string | null;
  field: string | null;
  required_level: 1 | 2 | 3;
  created_by: string;
  created_at: string;
  organization_id: string | null;
};

export type Poll = {
  id: string;
  title: string | null;
  token: string;
  status: "open" | "closed";
  created_by: string;
  created_at: string;
  organization_id: string | null;
};

export type PollSlot = {
  id: string;
  poll_id: string;
  start_time: string;
  end_time: string;
};

export type AvailabilityResponse = {
  id: string;
  poll_id: string;
  slot_id: string;
  participant_name: string;
  response: "yes" | "if_need_be" | "no";
  umpire_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ManagedTeam = {
  id: string;
  name: string;
  required_level: 1 | 2 | 3;
  created_by: string;
  created_at: string;
  organization_id: string | null;
};

export type Umpire = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  level: 1 | 2 | 3;
  created_at: string;
  updated_at: string;
};

export type Organization = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
  created_by: string;
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string;
  role: "planner" | "viewer";
  created_at: string;
};

export type TimeSlot = {
  start: Date;
  end: Date;
};

export type Assignment = {
  id: string;
  poll_id: string;
  match_id: string;
  umpire_id: string;
  created_at: string;
  organization_id: string | null;
};
