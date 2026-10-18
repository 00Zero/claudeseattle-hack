-- 0003_shared_admin_roles.sql
-- Super admin and the admin email allowlist. Owned by Adam. Changes require both devs' review.
-- - profiles.is_super_admin: can't be demoted or deleted by anyone (trigger below).
--   Granted only in the SQL editor. Only super admins grant or remove the admin
--   role and manage the allowlist (enforced in the admin server actions).
-- - admin_emails: when one of these emails is verified on a profile (signup, Luma
--   late link, add-email verification), that profile becomes an admin. Adding an
--   email promotes an existing account at once. Removing one doesn't demote.

-- ---------------------------------------------------------------
-- Super admin
-- ---------------------------------------------------------------
alter table profiles add column is_super_admin boolean not null default false;

create or replace function is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_super_admin from profiles where id = (select auth.uid())), false)
$$;

-- Blocks demoting or deleting a super admin, including through the service-role
-- client and cascades from auth.users. To change one, drop this trigger in the
-- SQL editor, make the change, and recreate it.
create or replace function protect_super_admin() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_super_admin then
      raise exception 'Super admins can''t be deleted';
    end if;
    return old;
  end if;
  if old.is_super_admin and (new.platform_role <> 'admin' or not new.is_super_admin) then
    raise exception 'Super admins can''t be demoted';
  end if;
  return new;
end $$;
create trigger profiles_protect_super_admin before update or delete on profiles
  for each row execute function protect_super_admin();

-- ---------------------------------------------------------------
-- Admin email allowlist
-- ---------------------------------------------------------------
create table admin_emails (
  email       text primary key check (email = lower(email)),
  note        text,
  created_at  timestamptz not null default now()
);
alter table admin_emails enable row level security;
create policy admin_emails_super on admin_emails for all using (is_super_admin()) with check (is_super_admin());
revoke all on admin_emails from anon;

-- Make a profile an admin (approved), unless it already is one.
create or replace function promote_allowlisted(p_profile uuid) returns void
language sql security definer set search_path = public as $$
  update profiles
     set platform_role = 'admin', status_override = 'approved', luma_status = 'approved'
   where id = p_profile and platform_role <> 'admin';
$$;

-- An allowlisted email became verified on a profile.
create or replace function profile_email_allowlist() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verified and exists (select 1 from admin_emails where email = lower(new.email)) then
    perform promote_allowlisted(new.profile_id);
  end if;
  return new;
end $$;
create trigger profile_emails_allowlist after insert or update of verified on profile_emails
  for each row execute function profile_email_allowlist();

-- An email was added to the allowlist: promote whoever already has it verified.
create or replace function admin_email_added() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform promote_allowlisted(profile_id)
     from profile_emails
    where lower(email) = new.email and verified;
  return new;
end $$;
create trigger admin_emails_added after insert on admin_emails
  for each row execute function admin_email_added();

-- Internal functions: not callable through /rest/v1/rpc.
revoke execute on function protect_super_admin()      from public, anon, authenticated;
revoke execute on function promote_allowlisted(uuid)  from public, anon, authenticated;
revoke execute on function profile_email_allowlist()  from public, anon, authenticated;
revoke execute on function admin_email_added()        from public, anon, authenticated;

-- ---------------------------------------------------------------
-- Seed super admin (run once in the SQL editor after this migration)
-- ---------------------------------------------------------------
-- update profiles set is_super_admin = true, platform_role = 'admin'
--  where id = (select id from auth.users where email = '<YOUR_EMAIL>');
