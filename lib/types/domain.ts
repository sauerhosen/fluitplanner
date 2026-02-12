export type Match = {
  id: string;
  date: string;
  start_time: string;
  home_team: string;
  away_team: string;
  competition: string | null;
  venue: string | null;
  created_by: string;
  created_at: string;
};

export type Poll = {
  id: string;
  title: string | null;
  token: string;
  status: "open" | "closed";
  created_by: string;
  created_at: string;
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
  created_at: string;
  updated_at: string;
};

export type TimeSlot = {
  start: Date;
  end: Date;
};
