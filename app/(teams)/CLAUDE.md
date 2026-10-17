# Teams app (Dev A, Nishant)

Spec: `docs/REQUIREMENTS.md`, "Teams app (Dev A)", plus the access table in "Shared foundation". Mobile-first; live by Sat Oct 24, 4:30 pm.

## You own

- `app/(teams)/**`: every route under `/teams` (browse, team page, create, apply, roster, public team page).
- `app/profile/**` once Adam's scaffold lands (Adam may still edit it).
- Your tables, prefixed `teams_`, in migrations named `<timestamp>_teams_<what>.sql` (`npx supabase migration new teams_<what>`). There is one database and it is production: push a migration only after its PR merges, from an up-to-date `main` (`npx supabase db push`).

## Shared data you use (`supabase/migrations/0001_shared.sql`)

- `teams` (`id`, `name` unique, `concept`, `looking_for`, `leader_id`, `created_at`, `updated_at`).
- `team_members` (`team_id`, `profile_id`, `status` = `applied | member | rejected | removed | left`, `applied_at`, `joined_at`). One `member` row per person (unique index `one_team_per_person`).
- `profiles`: `display_name`, names, `role_bucket`, `is_technical`, `job_title`, `company`, `linkedin_url`, `github_username`, `claude_code_level`, `bio`, `interests`, `looking_for`, `platform_role`, `luma_status`, `checked_in_at`, `profile_confirmed`, `public_profile`.
- `event_settings.team_formation_closes_at` for the deadline banner. Read it; don't hardcode.
- Views: `public_teams` and `public_team_members` for pages without login (members as "First L." unless `public_profile`); `team_leader_contacts` for the leader's current default email.

## How the rules work (RLS, enforced in the database)

- Browse: `can_browse()` (full access, any role). Pending users (`current_access() = 'profile_only'`) see only their own profile; send them to `/pending`.
- Create a team: insert into `teams` with `leader_id` = your own id; requires `can_join_teams()`. A trigger adds the leader as a `member`. It fails if the leader is already a member elsewhere.
- Apply: insert your own `team_members` row with `status = 'applied'`; requires `can_join_teams()`.
- Leader (`is_team_leader(team_id)`): update a row's `status` to `member`, `rejected`, or `removed`, and set `joined_at` when accepting. Only `status` and `joined_at` are updatable.
- Leave: update your own row to `status = 'left'`.
- Team size 2–6 and the 3–5 warning are app logic in your server actions; the database doesn't enforce them.
- No apply button, with a reason: `current_access() = 'profile_only'` (pending), or `platform_role` is `volunteer` or `judge`.
- Mentor badge: `platform_role = 'mentor'`. Mentors don't count toward balance. Balance = owner, professional, student (`role_bucket`) and at least one `is_technical` among members.
- Approval badge: `profiles.luma_status`.
- Profile edits: users can update only `first_name`, `last_name`, `role_bucket`, `is_technical`, `job_title`, `company`, `linkedin_url`, `github_username`, `claude_code_level`, `bio`, `interests`, `looking_for`, `profile_confirmed`, `public_profile`. Use `.update()` with just those columns, not `upsert`.
- Use `lib/supabase/server.ts` (server) or `client.ts` (browser). You shouldn't need the service-role client.

## Don't change

`0001_shared.sql` or the shared tables (ask Adam for a new migration), `lib/supabase/**`, `proxy.ts`, `app/layout.tsx` (shared: Dev B reviews), or Adam's login, auth, and admin routes.

## Boundary with judging

Judging reads `teams` and `team_members` (`status = 'member'`) to pre-fill entries and show rosters. Don't repurpose those columns or statuses. If Teams is late, the entry form falls back to a free-text team name plus member emails, so judging never blocks on you.
