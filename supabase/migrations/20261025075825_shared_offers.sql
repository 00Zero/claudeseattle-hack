-- 20261025075825_shared_offers.sql
-- Sponsor offers on /resources: free credits and promo codes (Claude API, Tavily, Wispr Flow).
-- Owned by Adam. Changes require both devs' review.
-- - offers: one row per provider. The copy is seeded here; admins switch each one on or off and
--   choose whether attendees must be checked in to see its links, in /admin/settings.
-- - offer_links: the redemption links and promo codes. They are not in this file (the repo is
--   public); admins add them in /admin/settings.
-- - Checked in: the Luma check-in (profiles.checked_in_at, updated by the Luma CSV import) or a
--   standby check-in an admin approved. Admins count as checked in.
-- - Attendees read through attendee_offers(), not the tables: it returns enabled offers to people
--   with full access, and the links only once the offer is unlocked for them.

create table offers (
  slug              text primary key check (slug ~ '^[a-z0-9-]+$'),
  provider          text not null check (length(provider) between 1 and 60),
  headline          text not null check (length(headline) between 1 and 120),
  about             text not null,
  details           text[] not null default '{}',
  steps             text[] not null default '{}',
  sort_order        integer not null default 0,
  enabled           boolean not null default true,
  requires_checkin  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger offers_updated before update on offers for each row execute function set_updated_at();

create table offer_links (
  id          uuid primary key default gen_random_uuid(),
  offer_slug  text not null references offers (slug) on update cascade on delete cascade,
  label       text not null check (length(label) between 1 and 80),
  url         text not null check (url ~ '^https://'),
  code        text check (length(code) between 1 and 80),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger offer_links_updated before update on offer_links for each row execute function set_updated_at();
create index offer_links_offer_idx on offer_links (offer_slug, sort_order);

alter table offers enable row level security;
alter table offer_links enable row level security;
create policy offers_admin on offers for all using (is_admin()) with check (is_admin());
create policy offer_links_admin on offer_links for all using (is_admin()) with check (is_admin());
revoke all on offers, offer_links from anon;

create or replace function is_checked_in() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_admin(), false)
      or exists (select 1 from profiles where id = auth.uid() and checked_in_at is not null)
      or exists (select 1 from standby_checkins where profile_id = auth.uid() and approved_at is not null)
$$;

create or replace function attendee_offers()
returns table (slug text, provider text, headline text, about text, details text[], steps text[],
               requires_checkin boolean, unlocked boolean, links jsonb)
language sql stable security definer set search_path = public as $$
  with me as (select is_checked_in() as checked_in)
  select o.slug, o.provider, o.headline, o.about, o.details, o.steps, o.requires_checkin,
         (not o.requires_checkin or me.checked_in),
         case when not o.requires_checkin or me.checked_in then
           coalesce((select jsonb_agg(jsonb_build_object('label', l.label, 'url', l.url, 'code', l.code)
                                      order by l.sort_order, l.label)
                       from offer_links l where l.offer_slug = o.slug), '[]'::jsonb)
         else '[]'::jsonb end
    from offers o cross join me
   where o.enabled and can_browse()
   order by o.sort_order, o.provider
$$;
revoke execute on function attendee_offers() from public, anon;
grant execute on function attendee_offers() to authenticated;

insert into offers (slug, provider, headline, about, details, steps, sort_order, requires_checkin) values
  ('claude', 'Claude by Anthropic', '$100 in Claude API credits',
   'Build your project on the Claude Developer Platform: Opus, Sonnet and Haiku, called from your own code, agents and tools.',
   array[
     'For the Claude API only. The credits don''t apply to Claude.ai or a Pro or Max plan.',
     'One claim per person.',
     'The offer page shows when the link expires.'],
   array[
     'Sign in to the Claude Console at console.anthropic.com, or create an account.',
     'Copy your Organization ID from Settings, then Organization.',
     'Open the offer and paste that Organization ID. Your Claude.ai account ID won''t work: the form rejects it.',
     'Credits usually arrive within a few minutes. Check Billing in the Console.'],
   10, true),
  ('tavily', 'Tavily', '8,000 free Tavily API credits',
   'Web search and extraction built for AI agents. Give Claude live search results, page content and site crawls in one API call.',
   array[
     'Valid October 25 and 26 only, while they last.',
     'A basic search uses 1 credit, so that''s thousands of searches.'],
   array[
     'Click redeem: the promo code is copied for you and Tavily opens.',
     'Sign in to Tavily or create an account. Paste the code if the page asks for it.',
     'Copy your API key from the Tavily dashboard into your project.'],
   20, true),
  ('wispr-flow', 'Wispr Flow', 'Free months of Wispr Flow Pro',
   'AI voice dictation that works in every app, plus a meeting notetaker. Speak your prompts to Claude instead of typing them.',
   array[
     'New to Wispr Flow: 1 free month of Pro.',
     'Paying for Granola: up to 12 free months of Pro.'],
   array[
     'Pick the link that fits you and sign up.',
     'Install the Wispr Flow app and dictate anywhere you can type.'],
   30, false);
