# hack.claudeseattle.org

Platform for the Claude Impact Lab Hackathon (Sun Oct 25, 2026, Seattle): team formation, submissions, judging. Reused for future Seattle Claude events, so keep it minimal and structured. The spec is `docs/REQUIREMENTS.md`; read the section for your area before changing anything.

## Stack

Next.js 16 App Router, TypeScript, Tailwind. Supabase (Postgres, Auth with magic links, RLS). Vercel Hobby: production at hack.claudeseattle.org, a preview deploy on every PR. Public GitHub repo. `npm run dev`, `npm run build`, `npm run lint`.

Next.js 16 differs from older versions (for example, `middleware.ts` is now `proxy.ts`). Check the bundled docs before writing Next.js code; `AGENTS.md` (maintained by `next dev`, keep it committed) says where:

@AGENTS.md

`cacheComponents` is off on purpose: nearly every page depends on the logged-in user, so pages render per request. Don't turn it on without asking.

## Who owns what

Adam (@00Zero) owns all of it. For the Oct 25 hackathon, Nishant (Dev A) built the Teams app and Rajasuba (Dev B) built submission and judging; they helped only until the event, so their areas are Adam's now too. The spec sections and area notes still describe that code:

| Path | Area | Read first |
| --- | --- | --- |
| `app/(teams)/**` (routes under `/teams`), `app/profile/**` | Teams app | Spec "Teams app (Dev A)", `app/(teams)/CLAUDE.md` |
| `app/(judge)/**` (`/submit`, `/judge`, `/results`, `/entries`), `app/admin/judging/**` | Submission and judging | Spec "Judging app (Dev B)", `app/(judge)/CLAUDE.md` |
| Everything else, incl. `lib/supabase/**`, `proxy.ts`, `app/layout.tsx`, `app/globals.css`, `package.json` | Shared foundation | Spec "Shared foundation" |

## Table contract (`supabase/migrations/*_shared*.sql`)

- Tables: `profiles`, `profile_emails`, `teams`, `team_members`, `event_settings`, `luma_guests`, `access_rules`, `admin_emails`, `linkedin_enrichment` (admin; one row per profile per source), `survey_responses` (admin; synced from the two survey sheets), `business_insights` (admin; anonymous copy of the business survey, with revenue, for the public dataset), `resources` (links on `/resources` for approved attendees; admins edit them in Settings), `profile_technical_ai` (service role only; AI-suggested technical level, `lib/technical-rating.ts`), `login_requests` (admin; sign-in requests from emails that can't get a link by themselves), `standby_checkins` (admin; standby guests' check-in time and location, `lib/standby.ts`), `media_uploads` (log of photos and videos uploaded on `/resources` to a restricted Drive folder; people see their own, admins all), `offers` and `offer_links` (sponsor credits and promo codes on `/resources`; admin only, attendees read them through `attendee_offers()`, `lib/offers.ts`), `offer_clicks` (admin; who clicked which offer link or code, written only by `log_offer_click()`, stats on `/admin/offers`), `offer_codes` (admin; one-per-person promo codes such as OpenRouter's, handed to checked-in attendees by `claim_offer_codes()`; codes are loaded with the service role, never committed), `small_business_requests` (admin; searches from the finder on `/small-businesses`, written only by its server actions, `lib/small-business.ts`), `audience_votes` (one audience-choice ballot per checked-in guest, top three for 3/2/1 points; written only by `cast_audience_vote()`, read on `/vote` through `audience_ballot()`; off unless an admin turns on `event_settings.audience_voting_enabled` in Settings; open/closed is `event_settings.audience_voting`).
- Views: `public_teams`, `public_team_members` (anonymous-safe), `team_leader_contacts` (logged-in, full access), `unmapped_luma_tickets` (admin), `matching_profiles` (team-matching signals incl. survey answers; service role, server only, via `lib/matching.ts`), `survey_matches` (admin), `linkedin_profiles` (merged enrichment; feeds `matching_profiles`), `linkedin_enrichment_check` (admin), `audience_vote_results` (points per finalist; service role, the awards deck).
- Helpers: `current_access()`, `can_browse()`, `can_join_teams()`, `is_judge()`, `is_admin()`, `is_super_admin()`, `current_profile_role()`, `is_team_member(team_id)`, `is_team_leader(team_id)`, `is_checked_in()` (Luma check-in or approved standby check-in; admins true).
- Access is `access_rules[ticket_name, luma_status]` → `full` / `profile_only` / `blocked`; admins are always `full`. Roles live in `profiles.platform_role`.
- Read the migrations for columns; don't guess them.

## Rules

- **Merging:** Adam merges PRs once the Vercel check on the PR is green and it works on localhost (Vercel previews are behind Adam's login). Shared files (`lib/supabase/**`, `proxy.ts`, `app/layout.tsx`, `app/globals.css`, `package.json`) affect both apps: keep changes to them small and check that both `/teams` and `/submit` still work on localhost.
- **Branches:** start each change on a new branch from the latest `main`. Once a branch's PR is merged, don't push to it again (GitHub deletes it on merge); follow-up work goes on a new branch and a new PR.
- **Migrations:** schema changes only through new migration files in the repo, never the Supabase dashboard. The Supabase GitHub integration applies new migrations to production automatically when the PR merges to `main`, so merge only when the "Migration review" check is green. It blocks destructive changes (dropping tables or columns, truncate, delete, shared-table changes beyond adding nullable columns, disabling RLS); those go to Adam, and the check @mentions him on the PR. Never edit, rename or delete a merged migration. A new migration must be newer than every migration on `main`: if a newer one merged first, rename yours with `npx supabase migration new` and move the SQL. Don't run `supabase db push`. The integration deploys only on a push to `main`, so to confirm a migration is live, check its version in the project's migration history (Supabase dashboard, Database → Migrations) after the merge. If it's missing, check that "Deploy to production" is on (Supabase → Project Settings → Integrations → GitHub, production branch `main`).
- **Table prefixes:** Teams app tables are `teams_*` and judging tables `judge_*` (`npx supabase migration new teams_<what>` or `judge_<what>`); everything else is `shared_*`.
- **Shared tables** (`profiles`, `profile_emails`, `teams`, `team_members`, `event_settings`, `luma_guests`, `access_rules`): to change one, add `npx supabase migration new shared_<what>` in your PR. Prefer adding nullable columns over changing or dropping. Keep RLS enabled and add policies for anything new.
- **Dependencies:** adding an npm package is fine. Don't add one that duplicates a library already in `package.json` (a second date, UI, or form library); prefer well-known, maintained packages. Never commit a lockfile conflict: take main's `package-lock.json` and re-run `npm install`.
- Admin writes go through the service-role client (`lib/supabase/admin.ts`) after a server-side admin check. Everything else uses `lib/supabase/server.ts` or `client.ts`, so RLS applies. The one exception is team matching: `lib/matching.ts` reads `matching_profiles` with the service role after checking the caller can browse.
- Luma answers that aren't on `profiles` (why join, features of interest, employee count, enrichment) and all survey answers are for matching only: never render them or send them to the browser raw. The tiers are in `docs/REQUIREMENTS.md`, "Luma data: what goes where".
- Users can update only their own self-service profile columns (see the grants in the migration); `profile_emails` is read-only to users.
- **Models:** AI features for people using the platform (AI notes, matching, anything a user triggers) go through the Vercel AI Gateway (`AI_GATEWAY_API_KEY`), server-side only; use `anthropic/*` and `openai/*` models first; other gateway models are allowed. AI for working on the code (Claude Code, CI checks like "Migration review") runs on Adam's Claude subscription or your own Anthropic API key, never on the gateway key.
- **Analytics:** Google Analytics runs for signed-out and signed-in visitors (not admins or test accounts) and must never receive tokens or personal data. Every URL goes through `cleanUrl` in `components/site/analytics.tsx`. A new page with a token in its URL goes in `unmeasuredPages` (`lib/site.ts`); a path with personal data in it needs cleaning in `cleanUrl`.
- Secrets live only in `.env.local` and Vercel env. Never commit, print, or log them. `.env.example` lists the names.
- Luma ticket names come straight from the CSV. When touching the import or access rules, check `unmapped_luma_tickets` and the import's unmapped report for ticket names with no rule.
- No attendee data in the repo: no CSVs, dumps, or real emails in code, seeds, or tests. Use `@example.com`.
- `.github/CODEOWNERS` sends review requests as email notifications only; nothing waits on them.
- Personal notes go in `CLAUDE.local.md`, which is gitignored.
