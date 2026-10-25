-- 20261025214321_shared_openrouter_copy.sql
-- OpenRouter's personal codes are $10 each and expire at the end of 2026. Already set in
-- production by hand on event day; this keeps the repo in step. Owned by Adam.

update offers
   set headline = '$10 in OpenRouter API credits',
       details = array[
         'Your own link, made for you: it works once, so don''t share it.',
         'The credits expire December 31, 2026, so use them before the end of the year.',
         'For attendees who checked in at the event.'],
       personal_link_label = 'Claim your $10 in credits'
 where slug = 'openrouter';
