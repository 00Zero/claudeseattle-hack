-- 20261025220300_shared_offer_copy_hidden_codes.sql
-- A redeem link with a promo code always copies the code to the attendee's clipboard and says so,
-- even when the offer hides its codes. offers.show_code now only hides the code on the card.
-- Owned by Adam. Changes require both devs' review.
-- attendee_offers() sends every link's code again (for the caller's unlocked offers only, as before)
-- and marks each link with show_code. Same signature as in 20261025214903_shared_offer_editing.sql.

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
                                                         'code', c.code, 'show_code', coalesce(o.show_code, true)))
                       from offer_codes c
                      where o.personal_link_label is not null and c.offer_slug = o.slug and c.profile_id = auth.uid()), '[]'::jsonb)
           || coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'label', l.label, 'url', l.url,
                                                            'code', l.code, 'show_code', coalesce(o.show_code, true))
                                         order by l.sort_order, l.label)
                          from offer_links l where l.offer_slug = o.slug), '[]'::jsonb)
         else '[]'::jsonb end
    from offers o cross join me
   where o.enabled and can_browse()
   order by o.sort_order, o.provider
$$;

-- The steps for the two offers with hidden codes, now that clicking copies the code again. Only
-- where the steps are still the ones 20261025214903 set, so edits made in /admin/offers stay.
update offers
   set steps = array[
     'Click redeem: the code is copied for you and Tavily opens with it applied.',
     'Sign in to Tavily or create an account to add the credits.',
     'Copy your API key from the Tavily dashboard into your project.']
 where slug = 'tavily'
   and steps = array[
     'Click redeem: Tavily opens with the code already applied.',
     'Sign in to Tavily or create an account to add the credits.',
     'Copy your API key from the Tavily dashboard into your project.'];
update offers
   set steps = array[
     'Click your link: your code is copied for you and OpenRouter opens with it applied.',
     'Sign in to OpenRouter or create an account, then redeem.',
     'Create an API key under Settings, then Keys, and use it in your project.']
 where slug = 'openrouter'
   and steps = array[
     'Click your link: OpenRouter opens with your code already applied.',
     'Sign in to OpenRouter or create an account, then redeem.',
     'Create an API key under Settings, then Keys, and use it in your project.'];
