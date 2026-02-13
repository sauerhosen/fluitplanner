-- Stage 5 fix: Change unique constraint on availability_responses from
-- (poll_id, slot_id, participant_name) to (poll_id, slot_id, umpire_id)
-- so that identity is based on umpire record, not display name.

-- Make umpire_id NOT NULL (all responses now come through umpire identification)
alter table public.availability_responses
  alter column umpire_id set not null;

-- Drop the old constraint based on participant_name
alter table public.availability_responses
  drop constraint availability_responses_poll_id_slot_id_participant_name_key;

-- Add new constraint based on umpire_id
alter table public.availability_responses
  add constraint availability_responses_poll_id_slot_id_umpire_id_key
  unique (poll_id, slot_id, umpire_id);
