-- 20261025210151_shared_offer_codes.sql
-- Personal promo codes for sponsor offers (first: OpenRouter). Owned by Adam. Changes require
-- both devs' review. See 20261025075825_shared_offers.sql for offers and offer_links.
-- - offers.personal_link_label: set for an offer whose links are one per person. Each person gets
--   their own code and link from offer_codes, shown first under this label.
-- - offer_codes: the codes, loaded by an admin with the service role (not in this file: the repo
--   is public). A code is assigned once and never handed to anyone else, even if the profile is
--   deleted (assigned_at stays set).
-- - claim_offer_codes(): gives the caller an unused code for each enabled personal offer they
--   don't have one for yet, if they are checked in for real (Luma or an approved standby check-in;
--   being an admin doesn't count) and not a test account. /resources calls it on every visit, so
--   people who check in later get a code while any are left.
-- - attendee_offers() adds the caller's own code to links, and a "personal" column so the page can
--   explain a personal offer with no code. log_offer_click() records a click on the personal link
--   (no link id) under the personal label.

alter table offers add column personal_link_label text check (length(personal_link_label) between 1 and 80);

create table offer_codes (
  code         text primary key check (length(code) between 1 and 120),
  offer_slug   text not null references offers (slug) on update cascade on delete cascade,
  url          text not null check (url ~ '^https://'),
  profile_id   uuid references profiles (id) on delete set null,
  assigned_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (offer_slug, profile_id)
);
create index offer_codes_free_idx on offer_codes (offer_slug, created_at) where assigned_at is null;

alter table offer_codes enable row level security;
create policy offer_codes_admin on offer_codes for all using (is_admin()) with check (is_admin());
revoke all on offer_codes from anon;

create or replace function claim_offer_codes() returns void
language plpgsql security definer set search_path = public as $$
declare
  o record;
  v_code text;
begin
  if auth.uid() is null or not can_browse() then return; end if;
  if not exists (select 1 from profiles p
                  where p.id = auth.uid() and not coalesce(p.is_test, false)
                    and (p.checked_in_at is not null
                         or exists (select 1 from standby_checkins s
                                     where s.profile_id = p.id and s.approved_at is not null))) then
    return;
  end if;
  for o in select f.slug from offers f
            where f.enabled and f.personal_link_label is not null
              and not exists (select 1 from offer_codes c where c.offer_slug = f.slug and c.profile_id = auth.uid()) loop
    select c.code into v_code from offer_codes c
     where c.offer_slug = o.slug and c.assigned_at is null
     order by c.created_at, c.code
     limit 1
     for update skip locked;
    if v_code is not null then
      update offer_codes set profile_id = auth.uid(), assigned_at = now() where code = v_code;
    end if;
  end loop;
exception when unique_violation then
  null;  -- a parallel request from the same person claimed one first
end $$;
revoke execute on function claim_offer_codes() from public, anon;
grant execute on function claim_offer_codes() to authenticated;

-- Same as before plus the caller's own code and the "personal" column. The return type changes,
-- so the function is dropped and created again.
drop function attendee_offers();
create function attendee_offers()
returns table (slug text, provider text, headline text, about text, details text[], steps text[],
               requires_checkin boolean, unlocked boolean, personal boolean, links jsonb)
language sql stable security definer set search_path = public as $$
  with me as (select is_checked_in() as checked_in)
  select o.slug, o.provider, o.headline, o.about, o.details, o.steps, o.requires_checkin,
         (not o.requires_checkin or me.checked_in),
         o.personal_link_label is not null,
         case when not o.requires_checkin or me.checked_in then
           coalesce((select jsonb_agg(jsonb_build_object('id', null, 'label', o.personal_link_label, 'url', c.url, 'code', c.code))
                       from offer_codes c
                      where o.personal_link_label is not null and c.offer_slug = o.slug and c.profile_id = auth.uid()), '[]'::jsonb)
           || coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'label', l.label, 'url', l.url, 'code', l.code)
                                         order by l.sort_order, l.label)
                          from offer_links l where l.offer_slug = o.slug), '[]'::jsonb)
         else '[]'::jsonb end
    from offers o cross join me
   where o.enabled and can_browse()
   order by o.sort_order, o.provider
$$;
revoke execute on function attendee_offers() from public, anon;
grant execute on function attendee_offers() to authenticated;

create or replace function log_offer_click(p_slug text, p_link uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare v_label text;
begin
  if auth.uid() is null or not can_browse() or p_kind not in ('link', 'code') then return; end if;
  if not exists (select 1 from offers
                  where slug = p_slug and enabled and (not requires_checkin or is_checked_in())) then
    return;
  end if;
  if p_link is not null then
    select label into v_label from offer_links where id = p_link and offer_slug = p_slug;
    if not found then return; end if;
  else
    select personal_link_label into v_label from offers where slug = p_slug;
  end if;
  insert into offer_clicks (profile_id, offer_slug, link_id, link_label, kind)
  values (auth.uid(), p_slug, p_link, v_label, p_kind);
end $$;

insert into offers (slug, provider, headline, about, details, steps, sort_order, requires_checkin, personal_link_label) values
  ('openrouter', 'OpenRouter', 'Free OpenRouter API credits',
   'One API key for hundreds of models, Claude, GPT, Gemini and open-weight models among them, with a single bill. Switch models without changing your code.',
   array[
     'Your own link, made for you: it works once, so don''t share it.',
     'For attendees who checked in at the event.'],
   array[
     'Click your link: the code is copied for you and OpenRouter opens.',
     'Sign in to OpenRouter or create an account, then redeem the code.',
     'Create an API key under Settings, then Keys, and use it in your project.'],
   15, true, 'Claim your OpenRouter credits');
