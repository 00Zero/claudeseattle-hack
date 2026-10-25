# Judging app: implementation plan (Dev B)

Spec: `docs/REQUIREMENTS.md`, "Judging app (Dev B)" and "Rubric". Area rules: `app/(judge)/CLAUDE.md`.
Event: Sun Oct 25. Submissions close 5:30 pm, prelim 5:30–6:30 pm, finals 6:30–7:30 pm, winners 7:30 pm.

## Milestones

| Date | Goal | Done when |
| --- | --- | --- |
| Tue Oct 20 (tonight) | PR 1: `judge_` migration merged | Adam has applied it; `judge_entries` exists in Supabase |
| Wed Oct 21 | Usable version on production | A team member can save an entry at `/submit`; admin can assign it at `/admin/judging`; a judge can score it at `/judge`. Call with Adam 5:30–8 pm or 10–11 pm |
| Fri Oct 23 | Working version; judging freeze starts Fri night | Every must-have below checked on a preview deploy, on a phone |
| Sat Oct 24 | Adam reviews (morning); rehearsal with two real judges and fake entries (evening) | Fake entries cleaned up afterwards; submission and judging finalized by 8 pm |
| Sun Oct 25 | Live by 9:00 am | |

The Supabase project is shared with production and only Adam applies migrations, so nothing that
writes judge data can be tested until PR 1 is merged and applied. Get PR 1 out first and keep
later schema changes to new migrations (never edit a merged one).

## Data model (`supabase/migrations/*_judge_core.sql`)

| Table | Purpose | Who reads | Who writes |
| --- | --- | --- | --- |
| `judge_entries` | One entry per team: title, tagline, description (in `description_long`; `description_short` is cleared on save, older entries show both together), video URL, repo URL, extra links, the old shared "who did what" (`contributions`), completeness checklist, last saved | Team members, judges, admins | Team members (participant or admin role) before the deadline; admin any time |
| `judge_late_saves` | A save made after `submissions_close_at`, keyed on the team (works even if the team never saved before the deadline); kept apart until admin accepts (copied onto the entry, creating it if needed) or rejects | Team members, admins | Team members insert; admin decides |
| `judge_assignments` | Prelim: entry → judge | The judge (own rows), admins | Admins |
| `judge_scores` | One row per entry, judge, round (`prelim` / `final`); scores 1–8 for the criteria keys in `criteria` (null = the default four), same order, plus a comment | The judge (own rows), admins | Judges: prelim only for assigned entries, final only for finalists |
| `judge_ai_notes` | Claude's notes and draft scores per entry (nice-to-have) | Judges, admins | Server only (service role) |

Views:
- `judge_entry_results` (service role only): prelim mean and vote count, final mean and vote count, finalist flag (top prelim mean in each judge's group), place (rank by final mean among finalists). Feeds the admin table and `/judge/results`.
- `public_judge_entries` (anon): entry fields after `submissions_close_at` only, with team name. Roster comes from `public_team_members`.
- `public_judge_results` (anon): finalists only when `publish_finalists`, places only when `publish_winners`. Never scores.

Functions (`*_judge_access.sql`): `judge_finalists()` (judges only) and `judge_final_standings()` (judges only, and empty until the caller has scored every finalist).

Rubric text stays in `lib/event.ts` (`rubric`), each criterion with a stable `key` (`works`, `ease`,
`impact`, `creativity`, `teamwork`). Admins pick the enabled keys (`event_settings.judging_criteria`,
null = the default four; `*_shared_judging_criteria.sql`); each score stores the keys its array
covers, so names and anchors can change without a migration and old scores stay valid. The
setting locks once any real-world score exists; test-world scores don't lock it.

## Routes and work items

### 1. `/submit` (team members) — Wed
- [x] Load the viewer's team (`team_members.status = 'member'`), entry pre-filled from `teams.concept`
- [x] Form: title, tagline, one description, demo video URL (required, 3 minutes or less), repo URL (required), extra links; "Who did what" per teammate (`judge_contributions`) while Teamwork is enabled
- [x] Server action save: before deadline → upsert entry; after → insert `judge_late_saves`
- [x] "Last saved" timestamp and deadline from `event_settings`; after the deadline a save warns, needs a confirm click, and is kept as a late save
- [x] Completeness checklist on save: required fields, repo URL returns 200 and is a public GitHub repo, video URL loads (YouTube, Loom, Vimeo, or direct)
- [x] Mentors, judges, volunteers, and pending users see why they can't submit
- [ ] Fallback if a team isn't on the Teams app: free-text team name + member emails (admin-created)

### 2. `/admin/judging` (admin) — Wed
- [x] Entries table: team, submitted, late flag, assigned judge (dropdown), prelim score and votes, final score and votes, finalist, place; sortable
- [x] "Teams without a submission: N" badge
- [x] Assign judge per entry; handle entries with no judge and judges with no entries
- [x] Accept or reject late saves
- [x] Publish toggles: `publish_finalists`, `publish_winners` (writes `event_settings` with the service role after `assertAdmin()`)
- [x] Criteria: one checkbox per criterion (default the four, Teamwork off; at least one on); locked once a real score exists

### 3. `/judge` (judges, on a phone) — Wed (prelim), Thu (finals)
- [x] My assigned entries with my score and status
- [x] Entry page: embedded video on top, repo link, tagline, description, roster, collapsed AI notes
- [x] Score form: the enabled criteria, 1–8 with anchors from `lib/event.ts`, optional comment
- [x] Live ranking of my group by mean (one decimal); top = my finalist; flag exact ties ("adjust scores to break the tie")
- [x] Final round tab: every finalist, same form, `round = 'final'`

### 4. `/judge/results` — Thu
- [x] Finalists ranked by mean final score with judge count; visible only after I've scored every finalist

### 5. `/results` and public entry pages — Thu
- [x] `/results`: only what the publish toggles allow
- [x] `/entries` and `/entries/[id]`: public entry pages after the deadline

### 6. Nice-to-haves, in order — Fri, only if must-haves are done
1. (built: "Write AI notes" on `/admin/judging`) AI notes at the deadline through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`, `anthropic/*` first): 2–3 sentences per criterion plus a draft score; collapsed for judges, never public, never added to scores
2. ~~Auto-distribute entries evenly across judges, manual override~~ (done: "Auto-assign" on `/admin/judging`)
3. Hide chosen entry fields from judges

## Open questions for Adam (Wed call)
- Entry edit rights: any team member (spec) or leader only?
- Late saves: is "kept apart until admin accepts" the behavior he wants?
- Judge load: one judge per entry, or pairs?
- Is AI as a judge in scope at all, beyond AI notes?
- Where should a "pitch mode" (3-minute pitches) sit if time allows: same score form?

## Testing
- Fake data uses `@example.com` and names prefixed `TEST`; delete before Saturday evening.
- Check every judge view on a phone width; check `/teams` still works on each preview.
- Run `npm run lint` and `npm run build` before each PR.
