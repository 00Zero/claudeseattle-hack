-- 20261025214903_shared_offer_editing.sql
-- Promo codes on /resources can be hidden per offer. Owned by Adam. Changes require both devs'
-- review. See 20261025075825_shared_offers.sql and 20261025210151_shared_offer_codes.sql.
-- - offers.show_code: when false, attendee_offers() leaves the promo codes out of the links, so the
--   page neither shows nor copies them (for links that apply the code themselves). NULL counts as
--   true. Admins switch it in /admin/offers, where they also edit each offer's copy and add offers.
-- - Tavily's and OpenRouter's links apply their codes, so their codes are hidden and the steps no
--   longer say the code is copied.

alter table offers add column show_code boolean default true;

update offers set show_code = false where slug in ('tavily', 'openrouter');
update offers
   set steps = array[
     'Click redeem: Tavily opens with the code already applied.',
     'Sign in to Tavily or create an account to add the credits.',
     'Copy your API key from the Tavily dashboard into your project.']
 where slug = 'tavily';
update offers
   set steps = array[
     'Click your link: OpenRouter opens with your code already applied.',
     'Sign in to OpenRouter or create an account, then redeem.',
     'Create an API key under Settings, then Keys, and use it in your project.']
 where slug = 'openrouter';

-- Same as in 20261025210151_shared_offer_codes.sql, except the codes are left out when show_code
-- is false.
create or replace function attendee_offers()
returns table (slug text, provider text, headline text, about text, details text[], steps text[],
               requires_checkin boolean, unlocked boolean, personal boolean, links jsonb)
language sql stable security definer set search_path = public as $$
  with me as (select is_checked_in() as checked_in)
  select o.slug, o.provider, o.headline, o.about, o.details, o.steps, o.requires_checkin,
         (not o.requires_checkin or me.checked_in),
         o.personal_link_label is not null,
         case when not o.requires_checkin or me.checked_in then
           coalesce((select jsonb_agg(jsonb_build_object('id', null, 'label', o.personal_link_label, 'url', c.url,
                                                         'code', case when coalesce(o.show_code, true) then c.code end))
                       from offer_codes c
                      where o.personal_link_label is not null and c.offer_slug = o.slug and c.profile_id = auth.uid()), '[]'::jsonb)
           || coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'label', l.label, 'url', l.url,
                                                            'code', case when coalesce(o.show_code, true) then l.code end)
                                         order by l.sort_order, l.label)
                          from offer_links l where l.offer_slug = o.slug), '[]'::jsonb)
         else '[]'::jsonb end
    from offers o cross join me
   where o.enabled and can_browse()
   order by o.sort_order, o.provider
$$;
