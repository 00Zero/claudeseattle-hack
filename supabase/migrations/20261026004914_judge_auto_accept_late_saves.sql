-- judge_auto_accept_late_saves: a save after submissions_close_at is accepted at once. There's no
-- hard stop on submissions: the late save is copied onto the team's entry (creating it if the
-- team never saved before the deadline) and kept, accepted, in judge_late_saves, so the entry
-- still shows as late (judge_entry_results.late) and when it was saved. Judges who scored before
-- it won't have seen it.
--
-- Runs as owner so it can write the entry after the deadline, when members can't
-- (entries_edit needs judge_submissions_open()). It copies only the entry's content columns, the
-- same ones members write before the deadline; judge_stamp_entry() stamps who saved and when.
-- An older late save never replaces a newer entry.

create or replace function judge_accept_late_save() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.decision := 'accepted';
  new.decided_at := now();
  insert into judge_entries as e (team_id, title, tagline, description_short, description_long,
                                  video_url, repo_url, links, contributions, checklist)
  values (new.team_id,
          coalesce(new.payload->>'title', ''),
          nullif(new.payload->>'tagline', ''),
          nullif(new.payload->>'description_short', ''),
          nullif(new.payload->>'description_long', ''),
          nullif(new.payload->>'video_url', ''),
          nullif(new.payload->>'repo_url', ''),
          case when jsonb_typeof(new.payload->'links') = 'array' then new.payload->'links' else '[]' end,
          nullif(new.payload->>'contributions', ''),
          case when jsonb_typeof(new.payload->'checklist') = 'object' then new.payload->'checklist' else '{}' end)
  on conflict (team_id) do update set
    title = excluded.title, tagline = excluded.tagline,
    description_short = excluded.description_short, description_long = excluded.description_long,
    video_url = excluded.video_url, repo_url = excluded.repo_url, links = excluded.links,
    contributions = excluded.contributions, checklist = excluded.checklist
  where e.last_saved_at is null or e.last_saved_at <= new.saved_at;
  return new;
end
$$;
revoke execute on function judge_accept_late_save() from public, anon, authenticated;

create trigger judge_late_saves_accept before insert on judge_late_saves
  for each row execute function judge_accept_late_save();
