-- 0002_shared_interests_cleanup.sql
-- Shared foundation, before kickoff. Owned by Adam. Changes require both devs' review.
-- 1. profiles.interests (separate from bio and looking_for), user-editable.
-- 2. Security advisor cleanup: fixed search_path, trigger and internal functions
--    not callable over the API, auth.uid() evaluated once per query in policies.

-- ---------------------------------------------------------------
-- 1. Interests
-- ---------------------------------------------------------------
alter table profiles add column interests text;
grant update (interests) on profiles to authenticated;

-- ---------------------------------------------------------------
-- 2a. Fixed search_path on the functions that didn't set one
-- ---------------------------------------------------------------
alter function set_updated_at() set search_path = public;
alter function luma_role_bucket(text) set search_path = public;
alter function luma_is_technical(text) set search_path = public;

-- ---------------------------------------------------------------
-- 2b. Trigger and internal functions: not callable through /rest/v1/rpc.
-- Triggers still fire; internal callers are security definer functions.
-- The RLS helpers (can_browse, can_join_teams, is_admin, is_judge,
-- current_access, current_profile_role, is_team_member, is_team_leader)
-- stay executable: policies call them as the querying role.
-- ---------------------------------------------------------------
revoke execute on function handle_new_user()        from public, anon, authenticated;
revoke execute on function sync_profile_from_luma() from public, anon, authenticated;
revoke execute on function add_leader_as_member()   from public, anon, authenticated;
revoke execute on function set_updated_at()         from public, anon, authenticated;
revoke execute on function access_for(text, luma_status) from public, anon, authenticated;
revoke execute on function default_role_for(text)   from public, anon, authenticated;

-- ---------------------------------------------------------------
-- 2c. Policies: (select auth.uid()) is evaluated once per query, not per row.
-- Same rules as 0001.
-- ---------------------------------------------------------------
alter policy profiles_self_read  on profiles using (id = (select auth.uid()));
alter policy profiles_self_write on profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy emails_self on profile_emails using (profile_id = (select auth.uid()));
alter policy teams_create on teams with check (can_join_teams() and leader_id = (select auth.uid()));
alter policy teams_leader on teams using (leader_id = (select auth.uid())) with check (leader_id = (select auth.uid()));
alter policy members_apply on team_members
  with check (can_join_teams() and profile_id = (select auth.uid()) and status = 'applied');
alter policy members_leave on team_members using (profile_id = (select auth.uid())) with check (status = 'left');

-- ---------------------------------------------------------------
-- Intentional advisor findings, documented where they live
-- ---------------------------------------------------------------
comment on view public_teams is
  'Anonymous-safe team list. Runs as owner on purpose (bypasses RLS) and exposes only these columns.';
comment on view public_team_members is
  'Anonymous-safe roster: "First L." unless public_profile. Runs as owner on purpose (bypasses RLS).';
comment on view team_leader_contacts is
  'Leader default email for logged-in users with full access (filtered by can_browse()). Runs as owner on purpose.';
