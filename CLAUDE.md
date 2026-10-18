# hack.claudeseattle.org

Platform for the Claude Impact Lab Hackathon (Sun Oct 25, 2026, Seattle): team formation, submissions, judging. Reused for future Seattle Claude events, so keep it minimal and structured. The spec is `docs/REQUIREMENTS.md`; read the section for your area before changing anything.

## Stack

Next.js 16 App Router, TypeScript, Tailwind. Supabase (Postgres, Auth with magic links, RLS). Vercel Hobby: production at hack.claudeseattle.org, a preview deploy on every PR. Public GitHub repo. `npm run dev`, `npm run build`, `npm run lint`.

Next.js 16 differs from older versions (for example, `middleware.ts` is now `proxy.ts`). Check the bundled docs before writing Next.js code; `AGENTS.md` (maintained by `next dev`, keep it committed) says where:

@AGENTS.md

`cacheComponents` is off on purpose: nearly every page depends on the logged-in user, so pages render per request. Don't turn it on without asking.

## Who owns what

- **Admin (Adam, @00Zero):** shared foundation. Spec: "Shared foundation".
- **Dev A (Nishant):** Teams app. Spec: "Teams app (Dev A)". Area notes: `app/(teams)/CLAUDE.md`.
- **Dev B (Rajasuba):** submission and judging. Spec: "Judging app (Dev B)". Area notes: `app/(judge)/CLAUDE.md`.

| Path | Owner |
| --- | --- |
| `app/(teams)/**` (routes under `/teams`) | Dev A |
| `app/profile/**` | Admin scaffolds, then Dev A |
| `app/(judge)/**` (`/submit`, `/judge`), `app/admin/judging/**` | Dev B |
| `app/page.tsx`, `app/login`, `app/auth`, `app/pending`, `app/declined`, `app/verify-email`, rest of `app/admin/**` | Admin |
| `lib/supabase/**`, `proxy.ts`, `app/layout.tsx`, `app/globals.css`, `package.json`, `package-lock.json`, this file | Shared |
| `supabase/migrations/*_shared*.sql` | Shared (see Rules) |
| `supabase/migrations/*_teams_*.sql`, `*_judge_*.sql` | Dev A, Dev B |

## Table contract (`supabase/migrations/*_shared*.sql`)

- Tables: `profiles`, `profile_emails`, `teams`, `team_members`, `event_settings`, `luma_guests`, `access_rules`, `admin_emails`.
- Views: `public_teams`, `public_team_members` (anonymous-safe), `team_leader_contacts` (logged-in, full access), `unmapped_luma_tickets` (admin).
- Helpers: `current_access()`, `can_browse()`, `can_join_teams()`, `is_judge()`, `is_admin()`, `is_super_admin()`, `current_profile_role()`, `is_team_member(team_id)`, `is_team_leader(team_id)`.
- Access is `access_rules[ticket_name, luma_status]` → `full` / `profile_only` / `blocked`; admins are always `full`. Roles live in `profiles.platform_role`.
- Read the migrations for columns; don't guess them.

## Rules

- **Merging:** each dev merges their own PRs once the preview deploy works. Shared files (`lib/supabase/**`, `proxy.ts`, `app/layout.tsx`, `app/globals.css`, `package.json`) affect both apps: keep changes to them small, check that both `/teams` and `/submit` still work on the preview, and mention the change in the dev WhatsApp group.
- **Migrations:** schema changes only through new migration files in the repo, never the Supabase dashboard. Never edit an existing migration file. Don't run `supabase db push`; Adam applies migrations to production after merge.
- **Your tables** are prefixed `teams_*` (Dev A) or `judge_*` (Dev B): `npx supabase migration new teams_<what>` or `judge_<what>`.
- **Shared tables** (`profiles`, `profile_emails`, `teams`, `team_members`, `event_settings`, `luma_guests`, `access_rules`): to change one, add `npx supabase migration new shared_<what>` in your PR. Prefer adding nullable columns over changing or dropping. Keep RLS enabled and add policies for anything new. Mention it in the dev WhatsApp group.
- **Dependencies:** adding an npm package is fine. Don't add one that duplicates a library already in `package.json` (a second date, UI, or form library); prefer well-known, maintained packages. Never commit a lockfile conflict: take main's `package-lock.json` and re-run `npm install`.
- Admin writes go through the service-role client (`lib/supabase/admin.ts`) after a server-side admin check. Everything else uses `lib/supabase/server.ts` or `client.ts`, so RLS applies.
- Users can update only their own self-service profile columns (see the grants in the migration); `profile_emails` is read-only to users.
- **Models:** use the Vercel AI Gateway (`AI_GATEWAY_API_KEY`); use `anthropic/*` and `openai/*` models first; other gateway models are allowed. Server-side only.
- Secrets live only in `.env.local` and Vercel env. Never commit, print, or log them. `.env.example` lists the names.
- Luma ticket names come straight from the CSV. When touching the import or access rules, check `unmapped_luma_tickets` and the import's unmapped report for ticket names with no rule.
- No attendee data in the repo: no CSVs, dumps, or real emails in code, seeds, or tests. Use `@example.com`.
- `.github/CODEOWNERS` sends review requests as email notifications only; nothing waits on them. When Nishant has joined the GitHub repo and merged a first PR, replace `@<nishant>` there with their GitHub username.
- Personal notes go in `CLAUDE.local.md`, which is gitignored.
