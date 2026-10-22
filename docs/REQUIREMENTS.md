# Claude Impact Lab Hackathon — Platform Requirements

Oct 17, 2026 · @Adam Burgh

## Overview

Two small web apps on one Next.js codebase at hack.claudeseattle.org, backed by one Supabase project, built by two volunteer developers in nine days for the Claude Impact Lab Hackathon on Sunday, October 25, 2026. The apps are reused for future Seattle Claude community events, so build minimal now and structured for reuse, not polished now.

| App | Owner | What it does | Live by | Fallback if it slips |
| --- | --- | --- | --- | --- |
| Teams (`/teams`) | Dev A | Attendees create profiles, create teams, browse teams, apply, accept. Shows each team's role balance. | Sat Oct 24, 4:30 pm | Name tags with role stickers and a printed roster at the happy hour; Adam assembles teams in a sheet |
| Judging (`/submit`, `/judge`, `/admin`) | Dev B | Teams submit entries; five judges each score their assigned entries and send one to the final; all judges score the finalists; admin publishes results. | Sun Oct 25, 9:00 am | Google Form per round plus a sheet; about one hour to set up |
| Shared foundation | Adam | Repo scaffold, auth, email linking, Luma import, shared tables, access rules, home page with schedule | Before kickoff | None; this gates both apps |

Milestones: kickoff call this weekend; usable version deployed Wed Oct 21; working version Fri Oct 23 evening; Adam reviews Sat Oct 24 morning; judging merge freeze from Fri night until the happy hour ends.

## Event facts the software depends on

Team formation closes Sunday 10:30 am; submissions close Sunday 5:30 pm; prelim judging happens 5:30–6:30 pm from the entry page only; finals are on stage 6:30–7:30 pm. Source: the [Luma event page](https://luma.com/claude-impact).

| When | What | Platform implication |
| --- | --- | --- |
| Sat Oct 24, 4:30–6:30 pm | Team formation happy hour (optional) | Teams app in heavy use on phones; roster pre-seeded from Luma |
| Sun 9:00–9:45 am | Check-in, breakfast, team formation for anyone unmatched | Teams app still open; Luma re-import marks who checked in |
| Sun 10:30 am | Start building | Team formation deadline; team edits still allowed but shown as past-deadline |
| Sun 5:30 pm | Submission deadline | Entry form goes read-only; late saves flagged, not blocked |
| Sun 5:30–6:30 pm | Prelim judging during dinner | Each judge reviews \~4 entries from the entry page: embedded demo video, repo link, description. Default is no presentations; if team count and time allow, teams may give a 3-minute pitch to their judge, so the judge view must work with the judge's phone in hand. |
| Sun 6:30–7:30 pm | Finals on stage | Five finalists each give a 5-minute live demo (slides optional, demo is the focus) plus 2 minutes Q\&A; all five judges score each on their phone between presentations |
| Sun 7:30 pm | Winners announced | Admin flips "publish winners"; results page goes public |

Numbers as of Oct 17: 498 Luma registrations, 83 approved, 391 pending, 4 waitlisted, 20 declined. Ticket types: Standard (427), Mentor (27), Volunteer (21), Ambassador (2), Judge (1). Expect roughly 15–25 teams and five judges.

Theme: build AI tools, workflows, and playbooks that small businesses can adopt. All projects are open-sourced on GitHub, which is why team and entry pages are public.

Prizes, for the home page and results page: every participant gets $100 in Claude API credits; the winning team gets one month of Claude Max 20x per person, tickets to the Seattle AI Week AI Summit (courtesy of WTIA), and a one-year WTIA membership. Venue: thinkspace Seattle, 1700 Westlake Ave N #200.

## Shared foundation (Adam, before kickoff)

Everything both apps depend on is built once, before day one, so neither dev builds it twice or differently: the repo scaffold, login and email linking, the Luma import, the shared tables, and the access rules.

**Stack.** Next.js App Router, TypeScript, Tailwind. Supabase (Postgres, Auth, RLS) in a dedicated org on the free plan. Vercel Hobby, public GitHub repo, one project, production at hack.claudeseattle.org, preview deploy on every PR. Resend for auth email. Claude API for AI notes. Devs use Claude Code.

**Repo layout.** One app, route groups by owner:

| Path | Owner | Notes |
| --- | --- | --- |
| `app/(teams)/teams/**` | Dev A | Browse, team page, create, apply, roster |
| `app/profile/**` | Adam scaffolds, Dev A extends | First-login confirmation form; Dev A adds bio, looking-for, technical level |
| `app/(judge)/submit/**`, `judge/**`, `admin/judging/**` | Dev B | Entry form, judge views, assignment and results table |
| `app/page.tsx`, `app/login`, `app/pending`, `app/admin/layout.tsx`, `admin/import`, `admin/people` | Adam | Home with schedule, login, pending page, admin shell, Luma import, approval queue |
| `lib/supabase/**`, `middleware.ts`, `app/layout.tsx` | Shared | Changes need the other dev's review |
| `supabase/migrations/0001_shared.sql` | Adam | Shared tables below; changes need both devs' review |
| `supabase/migrations/00NN_teams_*.sql`, `00NN_judge_*.sql` | Each dev | Own tables, prefixed `teams_` or `judge_` |

**Login and emails.** Magic link via Supabase Auth with Resend SMTP. A person can have several emails; any linked email logs into the same account; one is marked default and receives platform mail. Adding an email sends a verification link to that address first. The Luma import seeds two emails per guest. The registration email is pre-verified and is the preferred login: typing the Claude-account email sends the link there. The Claude-account email is self-reported (other people's addresses and typos turn up), so it links a guest only when exactly one guest gave it and it isn't someone's Luma email, and it is attached unverified; the person verifies it from their profile to sign in with it.

**Access.** Status comes from the Luma import and a `role` column on the profile.

| Ticket + Luma status | Account | Profile | Browse teams | Create or join team | Submit | Judge | Admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Participant (was Standard), approved | yes | yes | yes | yes | yes | no | no |
| Participant, pending or waitlist | yes | yes | no (pending page) | no | no | no | no |
| Mentor or Ambassador | yes | yes | yes | yes, shown with a mentor badge, not counted in balance | no | no | no |
| Volunteer | yes | yes | yes | no | no | no | no |
| Judge | yes | yes | yes | no | no | yes | no |
| Declined | no |  |  |  |  |  |  |
| Admin (profile flag, seeded with Adam) | yes | yes | yes | yes | yes | yes | yes |

Anyone not in the whitelist can still sign up and lands on the pending page; the admin queue shows them with the Luma email they typed, and Adam approves or ignores. The pending page says registration is awaiting approval and shows the Sunday schedule.

**Luma import.** Admin page: upload the Luma guests CSV, upsert on `guest_id`. Adam re-runs it every time he approves a batch and again Sunday morning for check-ins. Columns used: name, email, Claude-account email, approval status, ticket name, checked-in time, LinkedIn, GitHub, professional role, company, title, employee count, Claude Code level, GitHub experience, "why join", "features of interest". Role buckets: founder, small business owner, small business executive → owner; experienced professional, academia, non-profit, government, artist, other → professional; current student, recent grad → student. Technical flag pre-set to yes when GitHub experience is "run a shared repo" or "contributed to shared repos"; user confirms on first login. The import holds back a file whose ticket names have no access rule (Luma renamed Standard to Participant once) unless the admin confirms. LinkedIn enrichment lands in `linkedin_enrichment`, one row per profile per source, keyed by the slug of the LinkedIn URL the person gave (Apify rows by the URL that was requested, since LinkedIn may redirect to a renamed profile). Apify (harvestapi/linkedin-profile-scraper) is the main source; EnrichLayer validates it and fills gaps. `linkedin_profiles` merges them field by field (Apify first) and feeds `matching_profiles`; `linkedin_enrichment_check` (admin) compares the two. `scripts/import-linkedin-enrichment.ts` loads either export: dates normalized, at most 10 roles, and `raw` limited to the person's own profile (no suggested profiles, recommendations, followed accounts, photos, emails or open-to-work status). An admin upload comes later; it has to trim in the browser and send rows in batches, because Apify exports run about 50 KB per profile and Server Actions accept 1 MB per request.

**Luma data: what goes where.** Classified from the Luma guests export of Oct 20 (625 guests). Enforced by the import (`lib/luma.ts` keeps only the listed columns), RLS, and the `matching_profiles` view in `0005_shared_luma_matching.sql`. The same split applies when guest data later comes from another source (a browser extension or another registration tool): store it in `luma_guests` keyed on `guest_id`.

| Tier | Columns | Where it lives | Who sees it |
| --- | --- | --- | --- |
| Profile | first and last name, job title, company, LinkedIn, GitHub, Claude Code level; role bucket (from professional role) and technical flag (from GitHub experience) | Seeds `profiles` on first login; the person edits and confirms | Logged-in attendees with full access; public pages only with the public-profile opt-in |
| Matching only | professional role (finer than the bucket), employee count, GitHub experience, "why join", "features of interest", portfolio or business website, LinkedIn enrichment (headline, summary, current role, skills, experience, education) | `luma_guests` and `linkedin_enrichment` (admin RLS), read through `matching_profiles` with the service-role client in server code (`lib/matching.ts`) | Nobody directly. Matching shows only what it derives (a score, a reason, a blurb), never the raw answers |
| Admin only | Luma and Claude-account emails, approval status, ticket, check-in time, guest id, raw enrichment payload | `luma_guests`, `profile_emails`, `linkedin_enrichment.raw` | Admins; the person sees their own emails and status. Claude-account emails are also for distributing API credits |
| Never stored | QR code URL (works as a check-in pass), phone, payment fields and coupon code, crypto addresses, UTM fields, ad click IDs, referrer and "referred by" (holds other people's emails), survey and terms answers, newsletter opt-in (Anthropic's list, not ours) | Dropped by the import | Nobody |

**Survey data: what goes where.** Two Google Forms, synced by an Apps Script in each response sheet to `/api/surveys/sync` (`scripts/apps-script/survey-sync.gs`): every 2 hours until Sat Oct 24, 12:00 pm, every 30 minutes until Sun Oct 25, 8:00 am, then it stops. Each sync replaces the survey's rows in `survey_responses` (admin RLS). A response belongs to the Luma guest whose Luma email matches; failing that, the guest whose Claude-account email matches (unambiguous only); failing that, the one guest with the same LinkedIn profile. The link is computed on read (`survey_guest()`), so a later Luma import links new guests.

| Survey | Matching only (server-side, via `matching_profiles`) | Admin only | Public | Never stored |
| --- | --- | --- | --- | --- |
| Hackathon attendee survey | All answers (`attendee_survey`), for every matched person. Job-search answers move scores but are never mentioned in anything shown to people | Email, LinkedIn, timestamp | Nothing | Nothing beyond unlisted questions |
| Small business AI survey | All answers except revenue (`business_survey`), only for respondents who registered for the hackathon and aren't screened out ("Neither") | Email, LinkedIn, timestamp, business name, website, follow-up answer | Answers plus revenue of every respondent who isn't screened out, from `business_insights`: an anonymous copy with no contact details, timestamp or link back to the response, rewritten in random order each sync. `scripts/export-business-insights.ts` coarsens industry, size and location, removes names, businesses, links, places and money figures from written answers, an admin reads every row, then it goes in a Drive folder linked as a resource on `/resources`, which only approved attendees see | Respondent's name (dropped in the Apps Script and again on the server). Revenue is never stored with a response or used for matching |

Neither survey is pre-filled into profiles or shown in the UI. The form told business respondents that anonymized answers are shared with participants and that contact details are only used for follow-up, admission, and team matching.

**Resources.** `/resources` lists links for approved attendees (full access, any role): credits (Claude API, Tavily, Wispr Flow, OpenRouter), the name tag form, and the small business data folder. Pending people see a note; signed-out visitors go to login. Rows live in `resources` (RLS: visible rows for `can_browse()`, admins manage all), edited in Admin → Settings. Each link is the same for everyone; per-person codes would be a separate table assigned per profile. The header, phone menu and home page link to it for signed-in people. `event_settings.business_insights_url` is unused.

**Shared tables.** `profiles` (one per person: names, role bucket, technical flag, title, company, LinkedIn, GitHub, bio, interests, Luma status, ticket, checked-in, role flag, public-profile opt-in), `profile_emails` (email, verified, is\_default), `teams` (name, concept, leader, created), `team_members` (team, profile, status: applied / member / removed, joined), `luma_guests` (raw import), `linkedin_enrichment` (admin only). Entries, scores, assignments, and AI notes are judge-owned tables.

**Public vs private.** Team pages and, after 5:30 pm Sunday, entry pages are readable without login through a view that exposes team name, concept, entry fields, and members as first name plus last initial. Full profiles, emails, LinkedIn, company, scores, assignments, and AI notes are never readable anonymously; full profiles are visible to logged-in participants, and on public pages only when the person opted in. This is enforced in RLS in the shared migration, not in page code.

**Secrets.** Service-role key and Claude key live only in Vercel env. Devs get the anon key, their own Claude key with a $50 cap, and a Vercel AI Gateway key with $25. Nothing secret in the repo; `.env.example` lists the names.

## Teams app (Dev A)

A mobile-first tool people use on their phones at the happy hour and at Sunday check-in: confirm your profile, create a team or browse teams, apply, accept. Live by Saturday 4:30 pm.

**Must-have**

- [ ] Profile confirmation on first login: pre-filled from Luma (name, title, company, role bucket, LinkedIn, GitHub, Claude Code level); user edits and confirms the technical yes/no, adds a one-line bio and "what I'm looking for"
- [ ] Create a team: name (required), concept (one paragraph, becomes the public blurb and the entry's seed). Creator is leader.
- [ ] Browse teams: card per team with name, concept, member count, role-balance badges (owner / professional / student / technical: present or missing), "looking for" text. Search by name. Sort: open teams first.
- [ ] Apply to a team; leader sees applicants on the team page and accepts or rejects. Applicant sees status.
- [ ] One team per person. Leaving a team or being removed by the leader frees the person to apply elsewhere.
- [ ] Team size 2–6 enforced; warning shown when outside 3–5 ("teams should be 3–5").
- [ ] Team page: roster with name, title at company, LinkedIn and GitHub icons, approval badge per member, mentor badge, leader badge; applicants section for the leader; remove-member for the leader.
- [ ] Deadline shown on every teams page: "Team formation closes Sun Oct 25, 10:30 am". After it, pages still work but show "past deadline".
- [ ] Public team page (no login) through the public view: name, concept, members as first name and last initial, no links.
- [ ] People who can't join (pending, volunteer) see teams but no apply button, with the reason.

**Nice-to-have, in priority order**

1. Invite by email or by name: leader invites someone; invitee accepts from their team page.
2. Browse people: list of participants without a team, filterable by role bucket and technical flag; a leader can invite from it.
3. Luma re-import updates approval and check-in badges live (the import itself is shared; this is just reading it).
4. LinkedIn enrichment used for matching (and, if people opt in, shown on profile cards).
5. Mentor assignment to teams; one mentor can have several teams.
6. Technical level as a self-rated 1–5 ("how hands-on are you with code") instead of yes/no. The number is never shown to others; teams and profile cards show a band (none / some / builder). `is_technical` becomes rating ≥ 3.

   Claude-written "why this team fits" blurb when viewing a team.

**Out of scope.** Messaging or chat (link to the event Slack), auto-assignment of teams, photos, LinkedIn PDF parsing, approval of teams.

**Balance rule.** A team is balanced when it has at least one owner, one professional, one student, and at least one member with the technical flag. Show which of the four are present and which are missing; never block on it.

## Judging app (Dev B)

Teams submit an entry by 5:30 pm Sunday; five judges each score about four entries from the entry page during dinner and send one to the final; all five score the finalists on stage; admin publishes results at 7:30 pm. Live by Sunday 9:00 am; rehearsed with two real judges and fake entries Saturday evening.

**Must-have**

- [ ] Entry form at `/submit`, one per team, editable by any member until the deadline: title, one-line tagline, description (short and long), demo video URL (required), repo URL (required), additional links. Pre-filled from the team's concept. Shows "Last saved" timestamp and the deadline. After 5:30 pm the form is read-only; a save after the deadline is still stored but flagged `late` for admin to accept or reject.
- [ ] Completeness check on every save: required fields filled, repo URL returns 200 and looks public, video URL loads. Shown to the team as a checklist, so they fix it before 5:30.
- [ ] Admin: assign entries to judges (manual, table of entries with a judge dropdown; must handle an entry with no judge and a judge with no entries).
- [ ] Judge view at `/judge`: only my assigned entries. Entry page shows video embedded at the top, repo link, tagline, description, team roster, then a collapsed AI-notes section. Score form: four criteria, each 1–8 with no middle, one optional comment. Live ranking of my group by mean score; the top one is my finalist. Exact ties must be broken by adjusting scores.
- [ ] Final round: all five judges score each finalist with the same rubric; final score is the mean across judges.
- [ ] Admin table: one row per entry; columns for team, submitted, late flag, assigned judge, prelim score and vote count, final score and vote count, finalist, place. Sortable. Badge: "teams without a submission: N".
- [ ] Publish toggles: "publish finalists" and "publish winners". A public results page shows what is published and nothing else; teams never see raw scores by default.
- [ ] Public entry page after the deadline, through the public view.

**Nice-to-have, in priority order**

1. AI notes: at the deadline, Claude reads each entry and writes two or three sentences per criterion against the anchors below plus a draft score. Shown to judges collapsed, never added to human scores, never public.
2. Auto-distribute entries evenly across judges, with manual override.
3. Hide chosen entry fields from judges (for example member names).
4. Optional per-team score and rank visibility, off by default.
5. Configurable criteria and weights for future events; weights equal this time.
6. Judge groups (several judges per group) for future events.

**Rubric.** Four criteria, equal weight, each scored 1–8. Entry score is the mean of the four, shown to one decimal. Anchors are written per pair; the judge picks the low or high end of the pair.

| Criterion | 1–2 | 3–4 | 5–6 | 7–8 |
| --- | --- | --- | --- | --- |
| Does it work | Didn't run or is slides only | Parts run; core flow incomplete | Core flow works with bugs or rough edges | Works end to end; a business could try it today |
| Ease of implementation for a small business | Needs a developer and custom setup | Needs technical help to get started | A motivated owner could set it up with the README | Plug-and-play; clear README, no code needed |
| Impact on the business's operations | Unclear who it helps or how | Helps a narrow task a little | Saves real time or money on a common task | Changes how a core part of the business runs |
| Creativity of the solution | Generic chatbot or template | Sensible but predictable | A fresh angle on a known problem | Something judges hadn't thought of |

**Out of scope.** Scores out of 1000, AI ranking teams against each other, messaging, prizes management, check-in (comes from the Luma import).

## Working agreement

Each dev owns their route group and merges their own PRs without approval; anything shared gets the other dev's eyes; nothing touching judging merges between Friday night and the end of the happy hour.

- Branch from `main`, open a PR, check the preview deploy, merge your own directory. No approval required for your own route group.
- Shared files (`lib/supabase`, `middleware.ts`, root layout, `0001_shared.sql`) need the other dev's review before merge.
- Adding a dependency: say so in the channel first. Lockfile conflicts are the one merge conflict this layout produces.
- Schema changes go through a migration file in the repo, never the Supabase dashboard. Own tables use your prefix.
- Shared tables are frozen after kickoff. Need a column? Ask Adam; it ships as a new migration both devs review.
- The judging entry form reads team and members from the shared tables; if teams is late, the form falls back to free-text team name plus member emails.
- Daily: one line in the channel, "shipped / blocked". Thursday 10-minute call. Adam reviews preview deploys, not code.
- Wed Oct 21: usable version on production. Fri Oct 23 night: working version; judging freeze starts. Sat Oct 24 morning: Adam's review, copy and layout fixes only. Sat noon: go/no-go on teams app against the fallback. Sat evening: judging rehearsal with two real judges during the happy hour.
- Rollback is one click in Vercel; everyone knows where it is before Saturday.

## Decisions log and open questions

| Decision | Choice | Why |
| --- | --- | --- |
| One app or two | One Next.js app, route groups by owner | One login, one deploy, no cookie-domain work; cost is the Saturday freeze |
| Attendee login | Magic link, both Luma emails whitelisted, extra emails linkable with verification | 288 of 325 Claude-account emails differ from the Luma email |
| Unapproved sign-ups | Account plus pending page with schedule; admin queue | Cheap; five manual approvals beat an email-linking flow |
| Team size | 2–6 hard, 3–5 warned | Removes the exception workflow |
| Technical flag | Self-declared, pre-set from GitHub experience | Luma has no direct question |
| Finalist selection | Highest mean in the judge's group; judge adjusts scores to break ties | Simpler than a separate pick; prelim scores aren't published |
| Score | Mean of four criteria, 1–8, one decimal | Matches the rubric; no 1000-point scale |
| Public pages | Teams from the start, entries after deadline; members as first name and last initial unless opted in | Projects are public anyway; profile data came from registration |
| Supabase | New org, free plan, manual `pg_dump` snapshots | Org membership is all-or-nothing; Pro's only win was backups |
| Domain | claudeseattle.org on Cloudflare, `hack` CNAME to Vercel (DNS-only) | Matches webuildwithai.org; NS delegation for other ambassadors |

Open:

- [ ] Event Slack or Discord link for the "message" buttons; Adam has a Discord but hasn't decided. Fallback: mailto to the leader's default email.
- [ ] LinkedIn enrichment provider (EnrichLayer or Apify) and timing (Adam, Oct 17)
- [x] Sunday schedule and prizes text: taken from Luma, in Event facts above
- [x] Prelim format: entry page only by default; optional 3-minute pitches if time allows
- [x] Finals format: 5-minute live demo plus 2 minutes Q&A per finalist
