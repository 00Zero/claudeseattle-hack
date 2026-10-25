import type { Metadata } from "next";
import Image from "next/image";
import type { CSSProperties, ReactNode } from "react";
import { getEnabledCriteria } from "@/app/(judge)/_lib/criteria";
import { countWord } from "@/app/(judge)/_lib/scoring";
import { ThinkingDots } from "@/components/site/thinking-dots";
import { requireSuperAdminPage } from "@/lib/admin";
import { prizes, theme, venue as defaultVenue } from "@/lib/event";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { EVENT_TIME_ZONE } from "@/lib/time";
import { AgendaSlide, type AgendaItem } from "./agenda-slide";
import { Deck, type Slide } from "./deck";
import { SiteTour } from "./site-tour";
import styles from "./slides.module.css";

// No title of its own: anyone else gets a 404, and the tab shouldn't hint at what is here.
export const metadata: Metadata = { robots: { index: false } };

// The kickoff deck, super admins only (the present button in the header and on the home page
// opens it in full screen). Intro slides follow Adam's "Claude Impact Lab" deck; event details
// follow the Luma blasts and the spec. Deadlines, Wi-Fi, and criteria are read live, so the deck
// stays right if they change in Settings.

// Section header styled as a Claude Code tool call, like the home page's.
function Sig({ call, title }: { call: string; title: ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[22px] text-fg-faint">
        <span className="text-accent">⏺</span> {call}
      </p>
      <h2 className="mt-3 font-display text-[68px] font-light leading-[1.02] tracking-[-0.01em]">{title}</h2>
    </div>
  );
}

function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-sans text-[18px] font-semibold uppercase tracking-[0.16em] text-fg-muted ${className}`}>{children}</p>;
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12.5l5 5L20 6.5" />
    </svg>
  );
}

const pacificTime = new Intl.DateTimeFormat("en-US", { timeZone: EVENT_TIME_ZONE, hour: "numeric", minute: "2-digit" });
const clock = (iso: string) => pacificTime.format(new Date(iso)).replace(" AM", " am").replace(" PM", " pm");

// Real teams and people on them, for the team formation slide; test accounts don't count.
async function teamCounts() {
  const admin = createAdminClient();
  const [teams, members] = await Promise.all([
    // teams links to profiles more than once (leader, and members through team_members), so name the leader key.
    admin.from("teams").select("id, profiles!leader_id!inner(is_test)", { count: "exact", head: true }).eq("profiles.is_test", false),
    admin.from("team_members").select("team_id, profiles!inner(is_test)", { count: "exact", head: true }).eq("status", "member").eq("profiles.is_test", false),
  ]);
  if (teams.error || members.error) return null;
  return { teams: teams.count ?? 0, members: members.count ?? 0 };
}

export default async function SlidesPage() {
  await requireSuperAdminPage();
  const supabase = await createClient();
  const [{ data: settings }, { criteria }, counts] = await Promise.all([
    supabase.from("event_settings").select("team_formation_closes_at, submissions_close_at, venue_name, wifi_network, wifi_password").eq("id", 1).single(),
    getEnabledCriteria(supabase),
    teamCounts().catch(() => null),
  ]);

  const formationCloses = settings?.team_formation_closes_at ?? "2026-10-25T10:30:00-07:00";
  const submissionsClose = settings?.submissions_close_at ?? "2026-10-25T17:30:00-07:00";
  const venueName = settings?.venue_name ?? defaultVenue.name;
  const wifi = settings?.wifi_network && settings?.wifi_password ? { network: settings.wifi_network, password: settings.wifi_password } : null;

  // The kickoff-day schedule from the Luma blasts (9:45 kickoff included), deadlines from Settings.
  const agenda: AgendaItem[] = [
    { time: "9:00 am", what: "Check-in, breakfast, team formation", start: "2026-10-25T09:00:00-07:00", end: "2026-10-25T09:45:00-07:00" },
    { time: "9:45 am", what: "Opening kickoff", start: "2026-10-25T09:45:00-07:00", end: formationCloses },
    { time: clock(formationCloses), what: "Start building · team formation closes", start: formationCloses, end: submissionsClose, key: true },
    { time: clock(submissionsClose), what: "Submissions due (public GitHub repo)", start: submissionsClose, end: submissionsClose, key: true },
    { time: "5:30–6:30 pm", what: "Prelim judging over dinner", start: "2026-10-25T17:30:00-07:00", end: "2026-10-25T18:30:00-07:00" },
    { time: "6:30–7:30 pm", what: "Finals on stage: five live demos", start: "2026-10-25T18:30:00-07:00", end: "2026-10-25T19:30:00-07:00" },
    { time: "7:30 pm", what: "Winners announced", start: "2026-10-25T19:30:00-07:00", end: "2026-10-25T20:00:00-07:00" },
  ];

  const slides: Slide[] = [
    {
      title: "Welcome",
      tone: "dark",
      content: (
        <div className="flex h-full flex-col justify-between">
          <div className="flex items-center gap-10">
            <span className="inline-block origin-left scale-[2.6]">
              <ThinkingDots />
            </span>
            <Eyebrow className="text-[22px] text-accent">Claude Community Seattle · Seattle AI Week</Eyebrow>
          </div>
          <div>
            <h1 className="font-display text-[156px] font-light leading-[0.92] tracking-[-0.015em]">
              Impact Lab <em className="italic text-fg-muted">Hackathon</em>
            </h1>
            <p className="mt-10 max-w-[30ch] font-display text-[46px] font-light leading-snug">{theme}</p>
          </div>
          <div className="flex items-end justify-between">
            <p className="font-mono text-[26px] text-fg-muted">Sunday, October 25 · {venueName}</p>
            <p className="font-mono text-[36px]">
              <span className="text-accent">→ </span>hack.claudeseattle.org
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Your host",
      tone: "light",
      content: (
        <div className="grid h-full grid-cols-[1fr_380px] gap-16">
          <div className={`${styles.stagger} flex flex-col gap-7`}>
            <Sig call="Agent(host)" title="We Build With AI" />
            <div className="flex gap-14">
              {[
                { n: "50+", label: "events" },
                { n: "3,500+", label: "participants" },
              ].map((stat) => (
                <div key={stat.label} className="border-t-[3px] border-fg pt-3">
                  <span className="font-display text-[96px] font-light leading-none text-accent">{stat.n}</span>
                  <Eyebrow className="mt-2">{stat.label}</Eyebrow>
                </div>
              ))}
            </div>
            <p className="max-w-[34ch] font-display text-[38px] font-light italic leading-snug">Empowering everyone to build with AI, regardless of previous experience.</p>
            <ul className="grid gap-2 text-[26px] text-fg-muted">
              <li>→ AI workshops to build, publish, and enhance your own app</li>
              <li>→ Lightning hackathons to prototype new ideas</li>
              <li>→ Internal hackathons, trainings, and consulting for companies</li>
            </ul>
            <p className="font-mono text-[19px] leading-relaxed text-fg-faint">
              Participants from Amazon, Google, Meta, Microsoft, Apple, Zillow, T-Mobile, Expedia, Starbucks, Chase
              <br />
              Clients include Harvard, UW, J.P. Morgan, Madrona, Pioneer Square Labs, Yoodli
            </p>
          </div>
          <div className="flex flex-col justify-center gap-5">
            <Image src="/people/adam-burgh.jpg" alt="Adam Burgh" width={760} height={760} className="aspect-square w-full rounded-2xl border border-line object-cover" priority />
            <div>
              <p className="font-display text-[40px] font-light leading-tight">Adam Burgh</p>
              <p className="text-[21px] text-fg-muted">Founder, We Build With AI · Seattle Claude Ambassador</p>
              <p className="mt-2 text-[19px] text-fg-faint">Previously led product, growth, strategy, and marketing at Amazon, Uber, and Dropbox</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Vibe coding",
      tone: "dark",
      content: (
        <div className="grid h-full grid-cols-[1fr_1fr] items-center gap-16">
          <div className={`${styles.stagger} flex flex-col gap-8`}>
            <Sig call="Define(vibe coding)" title="What is vibe coding?" />
            <p className="font-display text-[42px] font-light leading-snug">You describe what you want in plain language. An AI agent writes, runs, and fixes the code.</p>
            <p className="text-[24px] text-fg-muted">Also called agentic coding or AI code generation. Collins Word of the Year 2025.</p>
            <blockquote className="border-l-4 border-accent pl-6 text-[24px] italic text-fg-muted">
              &ldquo;Fully give in to the vibes&hellip; and forget that the code even exists.&rdquo;
              <span className="mt-1 block font-mono text-[18px] not-italic text-fg-faint">Andrej Karpathy</span>
            </blockquote>
          </div>
          <div className="rounded-xl border border-line bg-bg-raised p-8 font-mono text-[22px] leading-[1.7] shadow-2xl">
            <p className="text-fg-faint">~/bakery-orders</p>
            <p className="mt-3">
              <span className="text-accent">&gt;</span> Build a booking page for my bakery that texts me new orders
            </p>
            <div className={styles.stagger}>
              <p className="mt-4 text-fg-muted">
                <span className="text-accent">⏺</span> Read(menu.csv)
              </p>
              <p className="text-fg-muted">
                <span className="text-accent">⏺</span> Write(app/booking/page.tsx) <span className="text-[#6fcf97]">✓</span>
              </p>
              <p className="text-fg-muted">
                <span className="text-accent">⏺</span> Bash(npm run dev) <span className="text-[#6fcf97]">✓ ready</span>
              </p>
              <p className="mt-3">
                <span className="text-accent">⏺</span> The booking page is live. Want me to add deposits?
              </p>
              <p className="mt-3">
                <span className="text-accent">&gt;</span> <span className={`${styles.cursor} inline-block h-[1.1em] w-3 bg-fg align-middle`} />
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Adoption",
      tone: "light",
      content: (
        <div className="flex h-full flex-col gap-10">
          <Sig call="Plot(adoption)" title="Technology no longer takes generations" />
          <div className="grid gap-2">
            <div className="flex h-9 gap-1 font-mono text-[15px] text-ink">
              <div className="flex items-center justify-center rounded-l bg-[#f3dacd]" style={{ width: "6%" }}>2.5%</div>
              <div className="flex items-center justify-center bg-[#e8b29c]" style={{ width: "13.5%" }}>13.5%</div>
              <div className="flex w-[6%] items-center justify-center font-semibold text-accent">CHASM</div>
              <div className="flex items-center justify-center bg-[#e3e0d5]" style={{ width: "31%" }}>34%</div>
              <div className="flex items-center justify-center bg-[#d3d0c5]" style={{ width: "29%" }}>34%</div>
              <div className="flex items-center justify-center rounded-r bg-[#b0aea5]" style={{ width: "14.5%" }}>16%</div>
            </div>
            <div className="flex font-mono text-[16px] text-fg-faint">
              <span style={{ width: "25.5%" }}>Innovators · early adopters</span>
              <span>Early majority · late majority · laggards</span>
            </div>
          </div>
          <div className="grid gap-5">
            <Eyebrow>Years to majority adoption</Eyebrow>
            {[
              { label: "Computers", years: 57, note: "" },
              { label: "The internet", years: 17, note: "" },
              { label: "LLMs", years: 9, note: "2017 → 2026 · crossed the chasm in 2022" },
              { label: "Agentic coding", years: 5, note: "2021 → 2026 · crossed the chasm in 2024", accent: true },
            ].map((row, i) => (
              <div key={row.label} className="grid grid-cols-[260px_1fr] items-center gap-6">
                <span className={`text-[28px] ${row.accent ? "font-semibold" : "text-fg-muted"}`}>{row.label}</span>
                <div className="flex items-center gap-5">
                  <div
                    className={`${styles.bar} h-12 rounded-r ${row.accent ? "bg-accent" : "bg-fg/80"}`}
                    style={{ "--w": `${(row.years / 57) * 78}%`, "--delay": `${i * 0.12}s` } as CSSProperties}
                  />
                  <span className="whitespace-nowrap font-display text-[40px] font-light">{row.years} yrs</span>
                  {row.note && <span className="whitespace-nowrap font-mono text-[17px] text-fg-faint">{row.note}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "Platforms",
      tone: "light",
      content: (
        <div className="flex h-full flex-col gap-8">
          <Sig call="Compare(platforms)" title="Two types of agentic coding platforms" />
          <div className="relative grid flex-1 grid-cols-[48px_1fr] grid-rows-[1fr_44px] gap-3">
            <div className="flex items-center justify-center">
              <span className="-rotate-90 whitespace-nowrap font-mono text-[18px] uppercase tracking-[0.14em] text-fg-faint">Capabilities →</span>
            </div>
            <div className="grid grid-cols-2 grid-rows-2 overflow-hidden rounded-xl border border-line-strong">
              <div className="flex flex-col gap-5 border-b border-r border-line bg-bg-raised p-7">
                <div>
                  <p className="text-[26px] font-semibold">Best for complex apps in production</p>
                  <p className="text-[21px] text-fg-muted">Requires coding and system design knowledge</p>
                </div>
                <div className={`${styles.stagger} flex flex-wrap gap-3`}>
                  {["Claude Code", "Cursor", "Windsurf", "GitHub Copilot"].map((name, i) => (
                    <span key={name} className={`rounded-full px-5 py-2 font-mono text-[24px] ${i === 0 ? "bg-accent text-ivory" : "border border-line-strong"}`}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
              <div className="border-b border-line" />
              <div className="border-r border-line" />
              <div className="flex flex-col justify-end gap-5 bg-bg-raised p-7">
                <div className={`${styles.stagger} flex flex-wrap gap-3`}>
                  {["Lovable", "Bolt", "Replit"].map((name) => (
                    <span key={name} className="rounded-full border border-line-strong px-5 py-2 font-mono text-[24px]">
                      {name}
                    </span>
                  ))}
                </div>
                <div>
                  <p className="text-[26px] font-semibold">Best for beginners and rapid prototyping</p>
                  <p className="text-[21px] text-fg-muted">No previous coding knowledge required</p>
                </div>
              </div>
            </div>
            <div />
            <p className="text-center font-mono text-[18px] uppercase tracking-[0.14em] text-fg-faint">Ease of use →</p>
          </div>
        </div>
      ),
    },
    {
      title: "Learning cycle",
      tone: "dark",
      content: (
        <div className="flex h-full flex-col gap-6">
          <Sig call="Plot(learning)" title="The typical learning cycle for vibe coders" />
          <svg viewBox="0 0 1400 520" className="w-full flex-1 overflow-visible" role="img" aria-label="A hype curve: a quick peak, a deep trough, then a long plateau">
            <path d="M40 500V20M40 500H1390" stroke="var(--line-strong)" strokeWidth="2" fill="none" />
            <text x="56" y="34" fill="var(--fg-faint)" fontSize="20" fontFamily="var(--font-geist-mono)" letterSpacing="2">
              EXPECTATIONS
            </text>
            <text x="1390" y="486" textAnchor="end" fill="var(--fg-faint)" fontSize="20" fontFamily="var(--font-geist-mono)" letterSpacing="2">
              EXPERIENCE
            </text>
            <path
              className={styles.draw}
              pathLength={1}
              d="M60 490 C130 300 170 70 250 70 C340 70 390 420 520 420 C620 420 660 250 790 225 C930 200 1100 205 1370 205"
              stroke="var(--accent)"
              strokeWidth="7"
              strokeLinecap="round"
              fill="none"
            />
            <g fill="var(--fg)" fontSize="28" fontFamily="var(--font-geist-sans)">
              <text x="290" y="72">Peak of inflated expectations</text>
              <text x="530" y="466">Trough of disillusionment</text>
              <text x="760" y="320">Slope of enlightenment</text>
              <text x="1010" y="180">Plateau of productivity</text>
              <text x="80" y="490" fill="var(--fg-muted)">Technology trigger</text>
            </g>
          </svg>
          <p className="font-display text-[34px] font-light">
            Mentors are here all day to get your team through the trough <span className="text-accent">↗</span>
          </p>
        </div>
      ),
    },
    {
      title: "The challenge",
      tone: "light",
      content: (
        <div className="flex h-full flex-col gap-10">
          <Sig call="Read(theme.md)" title="Build something a small business can use next week" />
          <p className="max-w-[56ch] text-[28px] leading-snug text-fg-muted">
            Over 700 people registered; you&apos;re in a room balanced on purpose. The business owner on your team brings real day-to-day challenges, not a client brief: build a tool any small business can pick up.
          </p>
          <div className={`${styles.stagger} grid flex-1 grid-cols-3 gap-10`}>
            {[
              { k: "Who's in the room", v: "Owners and founders, professionals, students and grads, builders", p: "Every team needs one of each, plus someone hands-on with code." },
              { k: "What ships", v: "A working tool with a README", p: "Plus a demo video. Slides are optional; the demo is the point." },
              { k: "Where it goes", v: "Open source, on GitHub", p: "Every entry is public, so any business can implement it." },
            ].map((cell) => (
              <div key={cell.k} className="flex flex-col gap-3 border-t-[3px] border-fg pt-5">
                <Eyebrow>{cell.k}</Eyebrow>
                <span className="font-display text-[38px] font-light leading-tight">{cell.v}</span>
                <p className="text-[22px] text-fg-muted">{cell.p}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "Get set up",
      tone: "dark",
      content: (
        <div className="grid h-full grid-cols-[1fr_480px] gap-16">
          <div className="flex flex-col gap-9">
            <Sig call="Bash(setup)" title="Your four steps" />
            <ol className={`${styles.stagger} grid gap-6`}>
              {[
                { t: "Check in at the front desk", p: "" },
                { t: "Sign in at hack.claudeseattle.org", p: "Use the same email you registered with on Luma" },
                { t: "Complete your profile", p: "It's how you find teammates and how teams find you" },
                { t: "Print your name tag, then form your team", p: "" },
              ].map((step, i) => (
                <li key={step.t} className="grid grid-cols-[72px_1fr] items-baseline">
                  <span className="font-display text-[64px] font-light leading-none text-accent">{i + 1}</span>
                  <span>
                    <span className="block font-display text-[42px] font-light leading-tight">{step.t}</span>
                    {step.p && <span className="block text-[23px] text-fg-muted">{step.p}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex flex-col justify-center gap-6">
            {wifi && (
              <div className="rounded-xl border border-line bg-bg-raised p-7 font-mono">
                <p className="text-[18px] uppercase tracking-[0.14em] text-fg-faint">Wi-Fi</p>
                <p className="mt-3 text-[32px]">{wifi.network}</p>
                <p className="text-[32px] text-accent">{wifi.password}</p>
              </div>
            )}
            <div className="rounded-xl border border-line p-7">
              <p className="font-mono text-[18px] uppercase tracking-[0.14em] text-fg-faint">Mentors, all day</p>
              <p className="mt-3 text-[24px] leading-snug text-fg-muted">Small business questions, project scoping, Claude Code, GitHub, and API credits. Flag one down anytime.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Agenda",
      tone: "light",
      content: (
        <div className="flex h-full flex-col gap-7">
          <div className="flex items-end justify-between">
            <Sig call="Read(schedule.md)" title="Today" />
            <p className="font-mono text-[20px] text-fg-faint">Lunch and dinner provided</p>
          </div>
          <AgendaSlide items={agenda} />
        </div>
      ),
    },
    {
      title: "Team formation",
      tone: "light",
      content: (
        <div className="grid h-full grid-cols-[1fr_1fr] gap-14">
          <div className="flex flex-col gap-7">
            <Sig call="Agent(teams)" title={`Form a team by ${clock(formationCloses)}`} />
            <p className="font-display text-[40px] font-light">
              <span className="text-accent">3 to 5 people</span>, with at least one of each:
            </p>
            <div className={`${styles.stagger} grid grid-cols-2 gap-4`}>
              {["Business owner or founder", "Student or recent grad", "Experienced professional", "Technical background"].map((role) => (
                <div key={role} className="flex items-center gap-3 rounded-xl border border-line bg-bg-raised px-5 py-4 text-[25px]">
                  <Check />
                  {role}
                </div>
              ))}
            </div>
            <ul className="grid gap-2 text-[23px] text-fg-muted">
              <li>→ Anyone can create a team, not just owners. Have an idea? Post it.</li>
              <li>→ You don&apos;t have to build for your owner&apos;s business.</li>
            </ul>
          </div>
          <div className="flex flex-col gap-6 pt-6">
            <div className="grid gap-4 rounded-xl border border-line bg-bg-raised p-7">
              <p className="font-mono text-[20px] text-fg-faint">hack.claudeseattle.org/teams</p>
              {[
                { k: "Create", v: "a team and post what you're looking for" },
                { k: "Browse", v: "teams and apply to the ones you like" },
                { k: "Invite", v: "people from the People list" },
              ].map((row) => (
                <p key={row.k} className="text-[26px]">
                  <span className="font-semibold text-accent">{row.k}</span> {row.v}
                </p>
              ))}
            </div>
            <div className="grid gap-3 rounded-xl bg-accent-soft p-7">
              <p className="font-display text-[34px] font-light leading-tight">Matching does the legwork</p>
              <p className="text-[22px] leading-snug text-fg-muted">
                &ldquo;Best fit&rdquo; ranks people for the roles your team is missing, and Claude adds top picks with a note on why each person fits. It reads profiles, Luma answers, LinkedIn, and the surveys; private answers only move the ranking and are never shown.
              </p>
            </div>
            {counts && (
              <p className="font-mono text-[24px] text-fg-muted">
                <span className="text-[40px] text-fg">{counts.teams}</span> teams · <span className="text-[40px] text-fg">{counts.members}</span> people on teams so far
              </p>
            )}
          </div>
        </div>
      ),
    },
    {
      title: "Judging",
      tone: "dark",
      content: (
        <div className="flex h-full flex-col gap-9">
          <Sig call="Review(entry, rubric)" title="How judging works" />
          <div className={`${styles.stagger} grid grid-cols-3 gap-6`}>
            {[
              { t: "5:30 pm", k: "Prelims over dinner", p: "Each judge scores about four entries and sends one to the final" },
              { t: "6:30 pm", k: "Finals on stage", p: "Five finalists: 5-minute live demo plus 2 minutes of Q&A" },
              { t: "7:30 pm", k: "Winners announced", p: "All judges score every finalist; the mean decides" },
            ].map((step) => (
              <div key={step.k} className="rounded-xl border border-line p-6">
                <p className="font-mono text-[22px] text-accent">{step.t}</p>
                <p className="mt-1 font-display text-[36px] font-light">{step.k}</p>
                <p className="mt-2 text-[21px] leading-snug text-fg-muted">{step.p}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-4">
            <Eyebrow>
              {countWord(criteria.length).replace(/^./, (c) => c.toUpperCase())} criteri{criteria.length === 1 ? "on" : "a"}, scored 1 to 8 with no middle · what a top score looks like
            </Eyebrow>
            <div className={`${styles.stagger} grid gap-4`} style={{ gridTemplateColumns: `repeat(${Math.min(criteria.length, 5)}, minmax(0, 1fr))` }}>
              {criteria.map((criterion) => (
                <div key={criterion.key} className="flex flex-col gap-3 border-t-[3px] border-accent pt-4">
                  <span className="text-[25px] font-semibold leading-tight">{criterion.name}</span>
                  <span className="text-[21px] leading-snug text-fg-muted">{criterion.anchors[criterion.anchors.length - 1]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Submit",
      tone: "light",
      content: (
        <div className="grid h-full grid-cols-[1fr_520px] items-center gap-16">
          <div className="flex flex-col gap-8">
            <Sig call="Submit(entry)" title={`Submit by ${clock(submissionsClose)}`} />
            <ul className={`${styles.stagger} grid gap-5`}>
              {[
                { t: "Title and one-line tagline", req: false },
                { t: "What it does and who it helps", req: false },
                { t: "Demo video link", req: true },
                { t: "Public GitHub repo with a README", req: true },
              ].map((item) => (
                <li key={item.t} className="flex items-center gap-4 text-[34px]">
                  <Check />
                  {item.t}
                  {item.req && <span className="rounded-full bg-accent-soft px-3 py-1 font-mono text-[17px] uppercase tracking-[0.1em] text-accent">required</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-6">
            <div className="rounded-xl border border-line bg-bg-raised p-7">
              <p className="font-mono text-[20px] text-fg-faint">hack.claudeseattle.org/submit</p>
              <p className="mt-3 text-[25px] leading-snug">Any teammate can edit the entry until the deadline. It checks your links as you save: get every item green.</p>
            </div>
            <p className="font-display text-[34px] font-light leading-snug">
              Every project is open source, so any small business can implement what you built.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Prizes",
      tone: "dark",
      content: (
        <div className="flex h-full flex-col gap-7">
          <div className="flex items-end justify-between gap-10">
            <Sig call="Grant(credits, max)" title="Prizes" />
            <p className="max-w-[24ch] text-right text-[22px] text-fg-muted">{prizes.winnersValue}</p>
          </div>
          <div className="flex items-baseline justify-between rounded-xl bg-accent-soft px-8 py-7">
            <span className="font-display text-[72px] font-light leading-none">{prizes.everyone.replace("Every participant gets ", "").replace(".", "")}</span>
            <Eyebrow className="text-fg">Every participant</Eyebrow>
          </div>
          <div className={styles.stagger}>
            {[...prizes.winners.map((p) => ({ p, who: "Winning team" })), ...prizes.topThree.map((p) => ({ p, who: "Top 3 teams" }))].map((row) => (
              <div key={row.p} className="flex items-baseline justify-between gap-10 border-t border-line py-4 last:border-b">
                <span className="font-display text-[34px] font-light leading-snug">{row.p}</span>
                <Eyebrow className="shrink-0">{row.who}</Eyebrow>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "Tour the site",
      tone: "light",
      content: (
        <div className="flex h-full flex-col gap-6">
          <Sig call="WebFetch(hack.claudeseattle.org)" title="Tour the site" />
          <div className="min-h-0 flex-1">
            <SiteTour
              pages={[
                { path: "/", label: "home", note: "Agenda, deadlines, Wi-Fi" },
                { path: "/profile", label: "profile", note: "Your profile and name tag" },
                { path: "/teams", label: "teams", note: "Create, browse, apply" },
                { path: "/teams/people", label: "people", note: "Best fit and invites" },
                { path: "/submit", label: "submit", note: "Your entry and its checklist" },
                { path: "/resources", label: "resources", note: "Credits, offers, photo uploads" },
              ]}
            />
          </div>
        </div>
      ),
    },
    {
      title: "Let's build",
      tone: "dark",
      content: (
        <div className="grid h-full grid-cols-[1fr_560px] gap-16">
          <div className="flex flex-col justify-between">
            <Eyebrow className="text-[22px] text-accent">Building starts at {clock(formationCloses)}</Eyebrow>
            <h2 className="font-display text-[190px] font-light italic leading-[0.9]">
              Let&apos;s
              <br />
              build.
            </h2>
            <p className="font-mono text-[24px] text-fg-muted">
              Questions? Find a mentor or volunteer · support@claudeseattle.org
            </p>
          </div>
          <div className="flex flex-col justify-center gap-6">
            <Eyebrow>Keep building with us</Eyebrow>
            <ul className={`${styles.stagger} grid`}>
              {[
                { d: "Mon, Oct 26", t: "Build with Claude at UW Foster: your AI chief of staff" },
                { d: "Wed, Oct 28", t: "Seattle Designers × PSL: creative problem solving with AI" },
                { d: "Tue, Nov 10", t: "Claude Cowork for MBA alumni: build your personal OS" },
              ].map((event) => (
                <li key={event.d} className="grid gap-1 border-t border-line py-4 last:border-b">
                  <span className="font-mono text-[19px] text-accent">{event.d}</span>
                  <span className="text-[25px] leading-snug">{event.t}</span>
                </li>
              ))}
            </ul>
            <p className="font-mono text-[22px]">
              <span className="text-accent">→ </span>luma.com/adamburgh
            </p>
            <p className="text-[19px] text-fg-faint">Can you help with space, credits, or food? events@webuildwithai.org</p>
          </div>
        </div>
      ),
    },
  ];

  return <Deck slides={slides} />;
}
