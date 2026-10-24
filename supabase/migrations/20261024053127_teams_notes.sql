-- teams_notes: an optional note (at most 50 words) with an application or an invite.
-- Owned by Dev A (Teams).
--
-- Invites: a nullable note on teams_invites, which only the invitee, the team's leader, and
-- admins can read (teams_invites_read). The leader sets it when inviting or re-inviting.
--
-- Applications: notes live in their own table, not on team_members, because every logged-in
-- attendee can read team_members (members_read). Here only the applicant, that team's
-- leader, and admins can read a note.

create or replace function teams_note_ok(p_note text) returns boolean
language sql immutable set search_path = public as $$
  select p_note is null
      or (char_length(p_note) <= 400
          and coalesce(array_length(regexp_split_to_array(btrim(p_note), '\s+'), 1), 0) <= 50)
$$;

-- Invite notes
alter table teams_invites add column note text;
alter table teams_invites add constraint teams_invites_note_ok check (teams_note_ok(note));
grant update (note) on teams_invites to authenticated;

-- Application notes
create table teams_application_notes (
  team_id     uuid not null references teams (id) on delete cascade,
  profile_id  uuid not null references profiles (id) on delete cascade,
  note        text not null check (teams_note_ok(note) and char_length(btrim(note)) > 0),
  created_at  timestamptz not null default now(),
  primary key (team_id, profile_id)
);

alter table teams_application_notes enable row level security;

create policy teams_application_notes_read on teams_application_notes for select
  using (profile_id = (select auth.uid()) or is_team_leader(team_id) or is_admin());

-- Applicants write their own note, only alongside their own application to that team.
create policy teams_application_notes_write on teams_application_notes for insert
  with check (
    profile_id = (select auth.uid())
    and exists (select 1 from team_members m
                 where m.team_id = teams_application_notes.team_id
                   and m.profile_id = (select auth.uid())
                   and m.status = 'applied')
  );

create policy teams_application_notes_admin on teams_application_notes for all
  using (is_admin()) with check (is_admin());

revoke all on teams_application_notes from anon;
revoke update, delete on teams_application_notes from authenticated;
