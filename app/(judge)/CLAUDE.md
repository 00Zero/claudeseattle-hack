# Judging app (Dev B, Rajasuba)

Spec: `docs/REQUIREMENTS.md`, "Judging app (Dev B)" and its "Rubric", plus "Event facts the software depends on". Live by Sun Oct 25, 9:00 am; judge views must work on a phone.

## You own

- `app/(judge)/**`: `/submit`, `/judge`, `/judge/results`, `/results`, and the public entry pages.

## Routes (starting point; change with Adam)

- `/judge`: my assigned entries, score form, live ranking of my group by mean; my top entry is my finalist.
- `/judge/results`: the final round across all judges: finalists ranked by mean final score with how many judges have scored each. A judge sees it only after submitting scores for every finalist, so nobody anchors on other judges' scores. Prelim scores from other groups aren't shown. This is what the panel checks before Adam flips "publish winners".
- `/results`: public; shows only what `publish_finalists` / `publish_winners` allow. Never raw scores.
- Public entry pages (after `submissions_close_at`): a dynamic route under `/submit` or `/entries`, your choice.
- `app/admin/judging/**`: assignments and the results table. It sits inside Adam's admin shell (`app/admin/layout.tsx`), so it's outside this route group but still yours.
- Your tables, prefixed `judge_` (entries, scores, assignments, AI notes), in migrations named `<timestamp>_judge_<what>.sql` (`npx supabase migration new judge_<what>`). Merging to `main` applies them to production automatically (Supabase GitHub integration), so merge only when the "Migration review" check is green; destructive changes are blocked and go to Adam. Never edit a migration that's already merged; if a newer migration lands on `main` first, rename yours with `npx supabase migration new` and move the SQL. Don't run `supabase db push`.

## Shared data you use (`supabase/migrations/*_shared*.sql`)

- `teams` (`id`, `name`, `concept` seeds the entry) and `team_members` (`status = 'member'` is the roster).
- `profiles` for rosters and judges (`display_name`, names, `platform_role`).
- `event_settings`: `submissions_close_at`, `publish_finalists`, `publish_winners`. Read them; don't hardcode.
- `public_teams`, `public_team_members` for public pages.

## Helpers for your RLS and server checks

- `is_team_member(team_id)`, `is_team_leader(team_id)`: who can edit a team's entry. The spec says any member; leader-only is the alternative, so confirm with Adam.
- `current_profile_role()`: submitting requires `participant` or `admin` (mentors are members but don't submit). `can_join_teams()` covers access too.
- `is_judge()` (judges and admins), `is_admin()`, `current_access()`, `can_browse()`.

## How to build on it

- Write RLS for every `judge_` table in your migration. Scores, assignments, and AI notes are never readable by anonymous users or participants.
- Public entry pages (after `submissions_close_at`) and the results page read views you create in your migration, granted to `anon`, exposing only entry fields and published results, with members as `display_name`.
- Admin actions (assign judges, accept or reject late saves, publish toggles): in a server action, load the caller's profile, check `platform_role = 'admin'`, then write with `createAdminClient()` from `lib/supabase/admin.ts`. The admin layout's check is not enough on its own.
- AI notes: server-side only, through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`); `anthropic/*` and `openai/*` models first, other gateway models allowed. Never shown publicly, never added to human scores.

## Shared code and tables

- Need a column on a shared table? Add a `shared_` migration in your PR (rules in the root `CLAUDE.md`) and mention it in the dev WhatsApp group.
- Shared files (`lib/supabase/**`, `proxy.ts`, `app/layout.tsx`, `app/globals.css`, `package.json`) affect the teams app too: keep changes small and check `/teams` still works on localhost.
- Leave `app/admin/layout.tsx` and Adam's login, auth, import, people, and settings routes alone. Never write to `teams` or `team_members`.

## Boundary with teams

Teams owns `teams` and `team_members`; you read them. If Teams is late, the entry form falls back to a free-text team name plus member emails, stored in your own `judge_` columns. Nothing touching judging merges between Friday night and the end of Saturday's happy hour.
